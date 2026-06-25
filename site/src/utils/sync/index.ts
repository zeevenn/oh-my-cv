import * as localForage from "localforage";
import { isClient } from "@renovamen/utils";
import type { StorageChange } from "~/utils/storage";
import { storageService } from "~/utils/storage";
import { setResume } from "~/utils/storage/utils";
import {
  buildSyncDocument,
  createGistFiles,
  getSyncDocumentFromGist,
  isSameSyncDocument,
  parseSyncDocument,
  resolveSyncDocument
} from "./document";
import { GithubDeviceFlowClient, GithubGistClient, readGistFile } from "./github";
import {
  GITHUB_SYNC_FILE,
  GITHUB_SYNC_GIST_DESCRIPTION,
  type GithubGist,
  type GithubSyncDocument,
  type StoredGithubSyncState
} from "./types";

const SYNC_STATE_KEY = "ohmycv_github_sync";
const SYNC_DEBOUNCE_MS = 1200;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const now = () => Date.now().toString();

const generateDeviceId = () => {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return cryptoId ?? `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getGithubClientId = () => {
  const config = useRuntimeConfig();
  const publicConfig = config.public as Record<string, string | undefined>;

  return publicConfig.githubOauthClientId ?? publicConfig.githubOAuthClientId ?? "";
};

const getGithubOauthProxyBase = () => {
  const config = useRuntimeConfig();
  const publicConfig = config.public as Record<string, string | undefined>;

  return publicConfig.githubOauthProxyBase || (import.meta.dev ? "/api/github" : "");
};

export class GithubSyncService {
  private _state: StoredGithubSyncState | null = null;
  private _initialized = false;
  private _unsubscribeStorageChange: (() => void) | null = null;
  private _syncTimer: ReturnType<typeof window.setTimeout> | null = null;
  private _syncing = false;

  private async _loadState() {
    if (!isClient) return null;

    if (!this._state) {
      this._state =
        (await localForage.getItem<StoredGithubSyncState>(SYNC_STATE_KEY)) ?? null;

      if (this._state && !this._state.lastSyncedDocumentUpdatedAt) {
        const lastSyncedAt = this._state.lastSyncedAt || this._state.localUpdatedAt;
        this._state.lastSyncedDocumentUpdatedAt =
          Number(this._state.localUpdatedAt) > Number(lastSyncedAt)
            ? lastSyncedAt
            : this._state.localUpdatedAt;
        await localForage.setItem(SYNC_STATE_KEY, this._state);
      }
    }

    return this._state;
  }

  private async _saveState(state: StoredGithubSyncState | null) {
    this._state = state;

    if (state) await localForage.setItem(SYNC_STATE_KEY, state);
    else await localForage.removeItem(SYNC_STATE_KEY);

    this._syncStoreFromState(state);
  }

  private _syncStoreFromState(state: StoredGithubSyncState | null) {
    const store = useSyncStore();

    if (!state) {
      store.reset();
      store.setSync("initialized", true);
      return;
    }

    store.setConnected({
      user: state.user,
      gistId: state.gistId,
      gistUrl: state.gistUrl,
      lastSyncedAt: state.lastSyncedAt
    });
    store.setSync("conflicts", state.conflicts ?? []);
    if (state.conflicts?.length) store.setSync("status", "conflict");
    store.setSync("initialized", true);
  }

  private _setError(error: unknown, fallback: string) {
    const store = useSyncStore();
    const message = error instanceof Error ? error.message : fallback;

    store.setSync("status", "error");
    store.setSync("error", message || fallback);
    console.error(fallback, error);
  }

  private async _createLocalDocument(
    updatedAt?: string,
    stateOverride?: StoredGithubSyncState
  ) {
    const state = stateOverride ?? (await this._loadState());
    const { VERSION } = useConstant();

    return buildSyncDocument({
      storageVersion: VERSION.CURRENT,
      deviceId: state?.deviceId ?? generateDeviceId(),
      storage: await storageService.getStorageData(),
      deleted: state?.deleted ?? {},
      updatedAt: updatedAt ?? state?.localUpdatedAt
    });
  }

  private async _readRemoteDocument(client: GithubGistClient, gist: GithubGist) {
    const content = await readGistFile(getSyncDocumentFromGist(gist));
    const { VERSION } = useConstant();

    return parseSyncDocument(content, VERSION.CURRENT);
  }

  private async _writeRemoteDocument(
    client: GithubGistClient,
    gist: GithubGist,
    doc: GithubSyncDocument
  ) {
    return await client.updateGist(gist.id, {
      description: GITHUB_SYNC_GIST_DESCRIPTION,
      files: createGistFiles(doc, gist)
    });
  }

  private async _applyDocument(doc: GithubSyncDocument) {
    await storageService.replaceStorageData(doc.data);

    const { data } = useDataStore();
    const currentId = data.resumeId?.toString();

    if (currentId && doc.data[currentId]) {
      await setResume({
        id: Number(currentId),
        ...doc.data[currentId]
      });
    }

    await refreshNuxtData("resume-list");
  }

  private _findExistingSyncGist(gists: GithubGist[]) {
    return gists.find(
      (gist) =>
        Boolean(gist.files[GITHUB_SYNC_FILE]) ||
        gist.description === GITHUB_SYNC_GIST_DESCRIPTION
    );
  }

  private _scheduleSync() {
    if (this._syncTimer) window.clearTimeout(this._syncTimer);

    this._syncTimer = window.setTimeout(() => {
      this.syncNow();
    }, SYNC_DEBOUNCE_MS);
  }

  private async _handleStorageChange(change: StorageChange) {
    const state = await this._loadState();
    if (!state) return;

    const timestamp = now();

    if (change.type === "delete") {
      state.deleted[String(change.resume.id)] = timestamp;
    } else if (change.type === "create" || change.type === "update") {
      delete state.deleted[String(change.resume.id)];
    }

    state.localUpdatedAt = timestamp;
    await this._saveState(state);
    this._scheduleSync();
  }

  public async init() {
    if (!isClient || this._initialized) return;

    this._initialized = true;
    this._unsubscribeStorageChange = storageService.onChange((change) =>
      this._handleStorageChange(change)
    );

    const state = await this._loadState();
    this._syncStoreFromState(state);

    if (state) {
      await this.syncNow({ quiet: true });
    }
  }

  public isConfigured() {
    return Boolean(getGithubClientId() && getGithubOauthProxyBase());
  }

  public async connect() {
    if (!isClient) return;

    const clientId = getGithubClientId();
    const proxyBase = getGithubOauthProxyBase();
    const store = useSyncStore();

    if (!clientId) {
      store.setSync("status", "error");
      store.setSync("error", "GitHub OAuth client ID is not configured.");
      return;
    }

    if (!proxyBase) {
      store.setSync("status", "error");
      store.setSync("error", "GitHub OAuth proxy base is not configured.");
      return;
    }

    try {
      store.setSync("status", "connecting");
      store.setSync("error", "");

      const oauth = new GithubDeviceFlowClient(clientId, proxyBase);
      const device = await oauth.requestDeviceCode();
      const expiresAt = Date.now() + device.expires_in * 1000;

      store.setSync("deviceLogin", {
        userCode: device.user_code,
        verificationUri: device.verification_uri,
        expiresAt
      });
      store.setSync("status", "waiting");

      window.open(device.verification_uri, "_blank", "noopener,noreferrer");

      let interval = device.interval;
      let token = "";

      while (Date.now() < expiresAt) {
        await delay(interval * 1000);

        const res = await oauth.pollToken(device.device_code);

        if ("access_token" in res) {
          token = res.access_token;
          break;
        }

        if (res.error === "authorization_pending") continue;
        if (res.error === "slow_down") {
          interval = res.interval ?? interval + 5;
          continue;
        }

        throw new Error(res.error_description ?? res.error);
      }

      if (!token) throw new Error("GitHub login expired.");

      const client = new GithubGistClient(token);
      const user = await client.getUser();
      const existingGist = this._findExistingSyncGist(await client.listGists());
      const timestamp = now();

      if (existingGist) {
        await this._saveState({
          provider: "github",
          token,
          gistId: existingGist.id,
          gistUrl: existingGist.html_url,
          user: {
            login: user.login,
            avatarUrl: user.avatar_url
          },
          deviceId: generateDeviceId(),
          deleted: {},
          conflicts: [],
          localUpdatedAt: timestamp,
          lastSyncedDocumentUpdatedAt: timestamp,
          lastSyncedAt: ""
        });

        await this.syncNow();
        return;
      }

      const state: StoredGithubSyncState = {
        provider: "github",
        token,
        gistId: "",
        gistUrl: "",
        user: {
          login: user.login,
          avatarUrl: user.avatar_url
        },
        deviceId: generateDeviceId(),
        deleted: {},
        conflicts: [],
        localUpdatedAt: timestamp,
        lastSyncedDocumentUpdatedAt: timestamp,
        lastSyncedAt: ""
      };

      const doc = await this._createLocalDocument(timestamp, state);
      const gist = await client.createGist({
        description: GITHUB_SYNC_GIST_DESCRIPTION,
        files: createGistFiles(doc) as Record<string, { content: string }>
      });

      state.gistId = gist.id;
      state.gistUrl = gist.html_url;
      state.lastSyncedAt = timestamp;
      state.lastSyncedDocumentUpdatedAt = doc.updated_at;
      state.baseDocument = doc;
      state.conflicts = [];
      await this._saveState(state);

      store.setSync("status", "connected");
    } catch (error) {
      this._setError(error, "GitHub sync connection failed.");
    }
  }

  public async syncNow(options: { quiet?: boolean } = {}) {
    const state = await this._loadState();
    const store = useSyncStore();

    if (!state) return;

    if (this._syncing) {
      if (!options.quiet) {
        store.setSync("status", "syncing");
        store.setSync("error", "");
      }
      return;
    }

    this._syncing = true;
    if (!options.quiet) store.setSync("status", "syncing");
    store.setSync("error", "");

    try {
      const client = new GithubGistClient(state.token);
      const gist = await client.getGist(state.gistId);
      const remoteDoc = await this._readRemoteDocument(client, gist);
      const localDoc = await this._createLocalDocument();
      const resolved = resolveSyncDocument(localDoc, remoteDoc, state);
      const mergedDoc = resolved.document;
      const shouldApplyLocal = !isSameSyncDocument(localDoc, mergedDoc);
      const shouldUploadRemote = !isSameSyncDocument(remoteDoc, mergedDoc);
      const timestamp = now();
      let syncedDoc = mergedDoc;

      if (resolved.conflicts.length) {
        state.conflicts = resolved.conflicts;
        state.lastSyncedAt = timestamp;
        await this._saveState(state);
        store.setSync("status", "conflict");
        return;
      }

      if (shouldApplyLocal) await this._applyDocument(mergedDoc);

      if (shouldUploadRemote) {
        syncedDoc = {
          ...mergedDoc,
          updated_at: maxDocumentTime(mergedDoc, timestamp),
          device_id: state.deviceId
        };

        await this._writeRemoteDocument(client, gist, syncedDoc);
      }

      state.localUpdatedAt = syncedDoc.updated_at;
      state.lastSyncedDocumentUpdatedAt = syncedDoc.updated_at;
      state.deleted = mergedDoc.deleted ?? {};
      state.baseDocument = syncedDoc;
      state.conflicts = [];
      state.lastSyncedAt = timestamp;
      await this._saveState(state);
      store.setSync("status", "connected");
    } catch (error) {
      this._setError(error, "GitHub sync failed.");
    } finally {
      this._syncing = false;
    }
  }

  public async resolveConflicts(source: "local" | "remote") {
    const state = await this._loadState();
    const store = useSyncStore();

    if (!state || !state.conflicts?.length) return;

    store.setSync("status", "syncing");
    store.setSync("error", "");

    try {
      const client = new GithubGistClient(state.token);
      const gist = await client.getGist(state.gistId);
      const remoteDoc = await this._readRemoteDocument(client, gist);
      const timestamp = now();
      let syncedDoc: GithubSyncDocument;

      if (source === "remote") {
        if (!remoteDoc) throw new Error("Remote sync document is missing.");

        await this._applyDocument(remoteDoc);
        syncedDoc = remoteDoc;
      } else {
        const localDoc = await this._createLocalDocument(undefined, state);

        syncedDoc = {
          ...localDoc,
          updated_at: maxDocumentTime(localDoc, timestamp),
          device_id: state.deviceId
        };

        await this._writeRemoteDocument(client, gist, syncedDoc);
      }

      state.localUpdatedAt = syncedDoc.updated_at;
      state.lastSyncedDocumentUpdatedAt = syncedDoc.updated_at;
      state.deleted = syncedDoc.deleted ?? {};
      state.baseDocument = syncedDoc;
      state.conflicts = [];
      state.lastSyncedAt = timestamp;
      await this._saveState(state);
      store.setSync("status", "connected");
    } catch (error) {
      this._setError(error, "GitHub sync conflict resolution failed.");
    }
  }

  public async disconnect() {
    if (this._syncTimer) {
      window.clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }

    await this._saveState(null);
  }

  public dispose() {
    this._unsubscribeStorageChange?.();
    this._unsubscribeStorageChange = null;
  }
}

const maxDocumentTime = (doc: GithubSyncDocument, fallback: string) => {
  const recordTimes = [
    doc.updated_at,
    ...Object.values(doc.data).map((resume) => resume.updated_at),
    ...Object.values(doc.deleted ?? {}),
    fallback
  ];

  return recordTimes.sort((a, b) => Number(b) - Number(a))[0] ?? fallback;
};

export const githubSyncService = new GithubSyncService();

export * from "./types";

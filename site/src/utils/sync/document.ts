import type { ValidVersion } from "~/composables/constant";
import type { StorageJsonData } from "~/utils/storage";
import {
  GITHUB_SYNC_FILE,
  GITHUB_SYNC_MARKDOWN_PREFIX,
  GITHUB_SYNC_README_FILE,
  type GithubGist,
  type GithubSyncDocument
} from "./types";

const now = () => Date.now().toString();

const maxTime = (...values: Array<string | undefined>) =>
  values.filter(Boolean).sort((a, b) => Number(b) - Number(a))[0] ?? "0";

const recordTime = (
  data: StorageJsonData[string] | undefined,
  fallback: string | undefined
) => data?.updated_at ?? fallback ?? "0";

const sortedData = (data: StorageJsonData) =>
  Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => Number(a) - Number(b))
  ) as StorageJsonData;

const sortedDeleted = (deleted: Record<string, string> = {}) =>
  Object.fromEntries(Object.entries(deleted).sort(([a], [b]) => Number(a) - Number(b)));

export const normalizeSyncDocument = (doc: GithubSyncDocument): GithubSyncDocument => ({
  ...doc,
  data: sortedData(doc.data),
  deleted: sortedDeleted(doc.deleted)
});

export const serializeSyncDocument = (doc: GithubSyncDocument) =>
  JSON.stringify(normalizeSyncDocument(doc), null, 2);

export const parseSyncDocument = (
  content: string | null,
  fallbackVersion: ValidVersion
): GithubSyncDocument | null => {
  if (!content) return null;

  try {
    const doc = JSON.parse(content);

    if (
      doc?.schema !== 1 ||
      doc?.app !== "oh-my-cv" ||
      typeof doc?.updated_at !== "string" ||
      typeof doc?.device_id !== "string" ||
      typeof doc?.data !== "object"
    ) {
      return null;
    }

    return normalizeSyncDocument({
      schema: 1,
      app: "oh-my-cv",
      storageVersion: doc.storageVersion ?? fallbackVersion,
      updated_at: doc.updated_at,
      device_id: doc.device_id,
      data: doc.data,
      deleted: doc.deleted ?? {}
    });
  } catch {
    return null;
  }
};

export const buildSyncDocument = (data: {
  storageVersion: ValidVersion;
  deviceId: string;
  storage: StorageJsonData;
  deleted?: Record<string, string>;
  updatedAt?: string;
}): GithubSyncDocument => {
  const localMaxTime = maxTime(
    ...Object.values(data.storage).map((resume) => resume.updated_at),
    ...Object.values(data.deleted ?? {})
  );

  return normalizeSyncDocument({
    schema: 1,
    app: "oh-my-cv",
    storageVersion: data.storageVersion,
    updated_at: data.updatedAt ?? localMaxTime ?? now(),
    device_id: data.deviceId,
    data: data.storage,
    deleted: data.deleted ?? {}
  });
};

export const mergeSyncDocuments = (
  local: GithubSyncDocument,
  remote: GithubSyncDocument
): GithubSyncDocument => {
  const ids = new Set([
    ...Object.keys(local.data),
    ...Object.keys(remote.data),
    ...Object.keys(local.deleted ?? {}),
    ...Object.keys(remote.deleted ?? {})
  ]);

  const data: StorageJsonData = {};
  const deleted: Record<string, string> = {};

  for (const id of ids) {
    const localResume = local.data[id];
    const remoteResume = remote.data[id];
    const localDeletedAt = local.deleted?.[id];
    const remoteDeletedAt = remote.deleted?.[id];
    const deletedAt = maxTime(localDeletedAt, remoteDeletedAt);
    const localTime = recordTime(localResume, local.updated_at);
    const remoteTime = recordTime(remoteResume, remote.updated_at);
    const latestResumeTime = maxTime(
      localResume ? localTime : undefined,
      remoteResume ? remoteTime : undefined
    );

    if (deletedAt !== "0" && Number(deletedAt) >= Number(latestResumeTime)) {
      deleted[id] = deletedAt;
      continue;
    }

    if (!localResume && remoteResume) {
      data[id] = remoteResume;
      continue;
    }

    if (localResume && !remoteResume) {
      data[id] = localResume;
      continue;
    }

    if (!localResume || !remoteResume) continue;

    if (Number(localTime) > Number(remoteTime)) {
      data[id] = localResume;
    } else if (Number(remoteTime) > Number(localTime)) {
      data[id] = remoteResume;
    } else {
      data[id] =
        Number(local.updated_at) >= Number(remote.updated_at)
          ? localResume
          : remoteResume;
    }
  }

  return normalizeSyncDocument({
    schema: 1,
    app: "oh-my-cv",
    storageVersion: local.storageVersion,
    updated_at: maxTime(local.updated_at, remote.updated_at, ...Object.values(deleted)),
    device_id:
      Number(local.updated_at) >= Number(remote.updated_at)
        ? local.device_id
        : remote.device_id,
    data,
    deleted
  });
};

export const isSameSyncDocument = (
  a: GithubSyncDocument | null,
  b: GithubSyncDocument | null
) => {
  if (!a || !b) return a === b;
  return serializeSyncDocument(a) === serializeSyncDocument(b);
};

export const markdownFilename = (id: string | number) =>
  `${GITHUB_SYNC_MARKDOWN_PREFIX}${id}.md`;

const readmeContent = `# Oh My CV Sync Data

This secret gist stores Oh My CV cloud sync data.

- ${GITHUB_SYNC_FILE} is the source of truth for restore and sync.
- resume-*.md files are readable copies for convenience.
- Secret gists are not private; anyone with the URL can read this content.
`;

export const createGistFiles = (
  doc: GithubSyncDocument,
  existingGist?: GithubGist
): Record<string, { content: string } | null> => {
  const files: Record<string, { content: string } | null> = {
    [GITHUB_SYNC_FILE]: {
      content: serializeSyncDocument(doc)
    },
    [GITHUB_SYNC_README_FILE]: {
      content: readmeContent
    }
  };

  for (const [id, resume] of Object.entries(doc.data)) {
    files[markdownFilename(id)] = {
      content: `# ${resume.name}\n\n${resume.markdown}`
    };
  }

  if (existingGist) {
    for (const filename of Object.keys(existingGist.files)) {
      if (
        filename.startsWith(GITHUB_SYNC_MARKDOWN_PREFIX) &&
        filename.endsWith(".md") &&
        !files[filename]
      ) {
        files[filename] = null;
      }
    }
  }

  return files;
};

export const getSyncDocumentFromGist = (gist: GithubGist) => gist.files[GITHUB_SYNC_FILE];

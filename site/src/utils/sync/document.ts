import { mergeDigIn } from "node-diff3";
import type { ValidVersion } from "~/composables/constant";
import type { StorageJsonData } from "~/utils/storage";
import {
  GITHUB_SYNC_FILE,
  GITHUB_SYNC_MARKDOWN_PREFIX,
  GITHUB_SYNC_README_FILE,
  type GithubGist,
  type GithubSyncConflict,
  type GithubSyncDocument,
  type GithubSyncResumeEntry,
  type StoredGithubSyncState
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }

  return value;
};

const stableStringify = (value: unknown) => JSON.stringify(stableValue(value));

const splitTextForMerge = (value: string) => value.match(/[^\n]*\n|[^\n]+/g) ?? [];

const tryMergeText = (base: string, local: string, remote: string) => {
  const merged = mergeDigIn<string>(
    splitTextForMerge(local),
    splitTextForMerge(base),
    splitTextForMerge(remote),
    { excludeFalseConflicts: true }
  );

  return merged.conflict ? null : merged.result.join("");
};

const sameValue = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

const sameEntry = (a: GithubSyncResumeEntry, b: GithubSyncResumeEntry) => sameValue(a, b);

const entryTime = (entry: GithubSyncResumeEntry) => {
  if (entry.status === "present") return entry.resume.updated_at;
  if (entry.status === "deleted") return entry.deletedAt;
  return "0";
};

const entryFromDocument = (
  doc: GithubSyncDocument,
  id: string
): GithubSyncResumeEntry => {
  const resume = doc.data[id];
  const deletedAt = doc.deleted?.[id];

  if (resume) {
    const resumeTime = recordTime(resume, doc.updated_at);

    if (deletedAt && Number(deletedAt) >= Number(resumeTime)) {
      return { status: "deleted", deletedAt };
    }

    return { status: "present", resume };
  }

  if (deletedAt) return { status: "deleted", deletedAt };
  return { status: "missing" };
};

const applyEntry = (
  id: string,
  entry: GithubSyncResumeEntry,
  data: StorageJsonData,
  deleted: Record<string, string>
) => {
  if (entry.status === "present") {
    data[id] = entry.resume;
    return;
  }

  if (entry.status === "deleted") deleted[id] = entry.deletedAt;
};

type ResumeRecord = StorageJsonData[string];
type MergeResumeResult =
  | {
      entry: GithubSyncResumeEntry;
      fields?: never;
    }
  | {
      entry: null;
      fields: string[];
    };

const RESUME_MERGE_FIELDS = [
  "name",
  "markdown",
  "css",
  "styles",
  "created_at"
] as const satisfies ReadonlyArray<keyof ResumeRecord>;

const setResumeField = <K extends keyof ResumeRecord>(
  resume: ResumeRecord,
  field: K,
  value: ResumeRecord[K]
) => {
  resume[field] = value;
};

const mergePresentResume = (
  base: ResumeRecord,
  local: ResumeRecord,
  remote: ResumeRecord
): MergeResumeResult => {
  const resume: ResumeRecord = { ...base };
  const conflictedFields: string[] = [];

  for (const field of RESUME_MERGE_FIELDS) {
    const baseValue = base[field];
    const localValue = local[field];
    const remoteValue = remote[field];
    const localChanged = !sameValue(localValue, baseValue);
    const remoteChanged = !sameValue(remoteValue, baseValue);

    if (!localChanged && !remoteChanged) {
      setResumeField(resume, field, baseValue);
      continue;
    }

    if (localChanged && !remoteChanged) {
      setResumeField(resume, field, localValue);
      continue;
    }

    if (!localChanged && remoteChanged) {
      setResumeField(resume, field, remoteValue);
      continue;
    }

    if (sameValue(localValue, remoteValue)) {
      setResumeField(resume, field, localValue);
      continue;
    }

    if (
      (field === "markdown" || field === "css") &&
      typeof baseValue === "string" &&
      typeof localValue === "string" &&
      typeof remoteValue === "string"
    ) {
      const mergedText = tryMergeText(baseValue, localValue, remoteValue);

      if (mergedText !== null) {
        setResumeField(resume, field, mergedText);
        continue;
      }
    }

    conflictedFields.push(field);
  }

  if (conflictedFields.length) {
    return { entry: null, fields: conflictedFields };
  }

  resume.updated_at = maxTime(base.updated_at, local.updated_at, remote.updated_at);

  return {
    entry: {
      status: "present",
      resume
    }
  };
};

const mergeChangedEntries = (
  base: GithubSyncResumeEntry,
  local: GithubSyncResumeEntry,
  remote: GithubSyncResumeEntry
): MergeResumeResult => {
  if (local.status === "deleted" && remote.status === "deleted") {
    return {
      entry: {
        status: "deleted",
        deletedAt: maxTime(local.deletedAt, remote.deletedAt)
      }
    };
  }

  if (local.status === "present" && remote.status === "present") {
    if (base.status !== "present") return { entry: null, fields: [] };
    return mergePresentResume(base.resume, local.resume, remote.resume);
  }

  return { entry: null, fields: [] };
};

const conflictReason = (
  base: GithubSyncResumeEntry,
  local: GithubSyncResumeEntry,
  remote: GithubSyncResumeEntry
) => {
  if (
    base.status === "missing" &&
    local.status === "present" &&
    remote.status === "present"
  ) {
    return "create_create";
  }

  if (
    base.status === "present" &&
    ((local.status === "deleted" && remote.status === "present") ||
      (local.status === "present" && remote.status === "deleted"))
  ) {
    return "delete_modify";
  }

  return "both_changed";
};

const createConflict = (
  id: string,
  base: GithubSyncResumeEntry,
  local: GithubSyncResumeEntry,
  remote: GithubSyncResumeEntry,
  fields: string[] = []
): GithubSyncConflict => ({
  id,
  reason: conflictReason(base, local, remote),
  createdAt: maxTime(entryTime(local), entryTime(remote), now()),
  fields,
  base,
  local,
  remote
});

const differingResumeFields = (
  local: GithubSyncResumeEntry,
  remote: GithubSyncResumeEntry
) => {
  if (local.status !== "present" || remote.status !== "present") return [];

  return RESUME_MERGE_FIELDS.filter(
    (field) => !sameValue(local.resume[field], remote.resume[field])
  );
};

const createNoBaseConflicts = (local: GithubSyncDocument, remote: GithubSyncDocument) => {
  const ids = new Set([
    ...Object.keys(local.data),
    ...Object.keys(remote.data),
    ...Object.keys(local.deleted ?? {}),
    ...Object.keys(remote.deleted ?? {})
  ]);
  const missingBase: GithubSyncResumeEntry = { status: "missing" };

  return [...ids].reduce<GithubSyncConflict[]>((conflicts, id) => {
    const localEntry = entryFromDocument(local, id);
    const remoteEntry = entryFromDocument(remote, id);

    if (!differingResumeFields(localEntry, remoteEntry).length) {
      if (
        (localEntry.status !== "present" || remoteEntry.status !== "present") &&
        !sameEntry(localEntry, remoteEntry)
      ) {
        conflicts.push(createConflict(id, missingBase, localEntry, remoteEntry));
      }

      return conflicts;
    }

    conflicts.push(
      createConflict(
        id,
        missingBase,
        localEntry,
        remoteEntry,
        differingResumeFields(localEntry, remoteEntry)
      )
    );

    return conflicts;
  }, []);
};

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

export const mergeSyncDocumentsWithBase = (
  base: GithubSyncDocument,
  local: GithubSyncDocument,
  remote: GithubSyncDocument
) => {
  const ids = new Set([
    ...Object.keys(base.data),
    ...Object.keys(local.data),
    ...Object.keys(remote.data),
    ...Object.keys(base.deleted ?? {}),
    ...Object.keys(local.deleted ?? {}),
    ...Object.keys(remote.deleted ?? {})
  ]);

  const data: StorageJsonData = {};
  const deleted: Record<string, string> = {};
  const conflicts: GithubSyncConflict[] = [];

  for (const id of ids) {
    const baseEntry = entryFromDocument(base, id);
    const localEntry = entryFromDocument(local, id);
    const remoteEntry = entryFromDocument(remote, id);

    if (sameEntry(localEntry, remoteEntry)) {
      applyEntry(id, localEntry, data, deleted);
      continue;
    }

    const localChanged = !sameEntry(baseEntry, localEntry);
    const remoteChanged = !sameEntry(baseEntry, remoteEntry);

    if (!localChanged && !remoteChanged) {
      applyEntry(id, baseEntry, data, deleted);
      continue;
    }

    if (localChanged && !remoteChanged) {
      applyEntry(id, localEntry, data, deleted);
      continue;
    }

    if (!localChanged && remoteChanged) {
      applyEntry(id, remoteEntry, data, deleted);
      continue;
    }

    const merged = mergeChangedEntries(baseEntry, localEntry, remoteEntry);

    if (merged.entry) {
      applyEntry(id, merged.entry, data, deleted);
      continue;
    }

    conflicts.push(createConflict(id, baseEntry, localEntry, remoteEntry, merged.fields));
  }

  return {
    document: normalizeSyncDocument({
      schema: 1,
      app: "oh-my-cv",
      storageVersion: local.storageVersion,
      updated_at: maxTime(
        base.updated_at,
        local.updated_at,
        remote.updated_at,
        ...Object.values(data).map((resume) => resume.updated_at),
        ...Object.values(deleted)
      ),
      device_id:
        Number(local.updated_at) >= Number(remote.updated_at)
          ? local.device_id
          : remote.device_id,
      data,
      deleted
    }),
    conflicts
  };
};

const lastSyncedDocumentTime = (state: StoredGithubSyncState) =>
  state.lastSyncedDocumentUpdatedAt ?? state.localUpdatedAt ?? "0";

export const hasUnsyncedLocalChanges = (state: StoredGithubSyncState) =>
  state.localUpdatedAt !== lastSyncedDocumentTime(state);

export const shouldPreferRemoteDocument = (
  remote: GithubSyncDocument,
  state: StoredGithubSyncState
) =>
  !hasUnsyncedLocalChanges(state) &&
  Number(remote.updated_at) > Number(lastSyncedDocumentTime(state));

export const resolveSyncDocument = (
  local: GithubSyncDocument,
  remote: GithubSyncDocument | null,
  state: StoredGithubSyncState
) => {
  if (!remote) return { document: local, conflicts: [] };
  if (shouldPreferRemoteDocument(remote, state)) {
    return { document: remote, conflicts: [] };
  }

  if (!state.baseDocument) {
    if (hasUnsyncedLocalChanges(state) && !isSameSyncDocument(local, remote)) {
      const conflicts = createNoBaseConflicts(local, remote);

      if (conflicts.length) return { document: local, conflicts };
    }

    return { document: mergeSyncDocuments(local, remote), conflicts: [] };
  }

  return mergeSyncDocumentsWithBase(state.baseDocument, local, remote);
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

import type { ValidVersion } from "~/composables/constant";
import type { StorageJsonData } from "~/utils/storage";

export const GITHUB_SYNC_GIST_DESCRIPTION = "Oh My CV encrypted-ready sync data";
export const GITHUB_SYNC_FILE = "ohmycv-sync.json";
export const GITHUB_SYNC_README_FILE = "README.md";
export const GITHUB_SYNC_MARKDOWN_PREFIX = "resume-";

export type GithubSyncDocument = {
  schema: 1;
  app: "oh-my-cv";
  storageVersion: ValidVersion;
  updated_at: string;
  device_id: string;
  data: StorageJsonData;
  deleted?: Record<string, string>;
};

export type GithubSyncResumeEntry =
  | {
      status: "present";
      resume: StorageJsonData[string];
    }
  | {
      status: "deleted";
      deletedAt: string;
    }
  | {
      status: "missing";
    };

export type GithubSyncConflictReason = "both_changed" | "create_create" | "delete_modify";

export type GithubSyncConflict = {
  id: string;
  reason: GithubSyncConflictReason;
  createdAt: string;
  fields?: string[];
  base: GithubSyncResumeEntry;
  local: GithubSyncResumeEntry;
  remote: GithubSyncResumeEntry;
};

export type StoredGithubSyncState = {
  provider: "github";
  token: string;
  gistId: string;
  gistUrl: string;
  user: {
    login: string;
    avatarUrl?: string;
  };
  deviceId: string;
  deleted: Record<string, string>;
  localUpdatedAt: string;
  lastSyncedDocumentUpdatedAt?: string;
  baseDocument?: GithubSyncDocument;
  conflicts?: GithubSyncConflict[];
  lastSyncedAt: string;
};

export type GithubGistFile = {
  filename: string;
  content?: string;
  raw_url?: string;
  truncated?: boolean;
  size?: number;
};

export type GithubGist = {
  id: string;
  html_url: string;
  description?: string;
  files: Record<string, GithubGistFile>;
};

export type GithubUser = {
  login: string;
  avatar_url?: string;
};

export type GithubDeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

export type GithubDeviceTokenResponse =
  | {
      access_token: string;
      token_type: string;
      scope: string;
    }
  | {
      error: "authorization_pending" | "slow_down" | "expired_token" | string;
      error_description?: string;
      interval?: number;
    };

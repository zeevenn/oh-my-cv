export type SyncProvider = "github";

export type SyncStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "connected"
  | "syncing"
  | "error";

export type SyncUser = {
  login: string;
  avatarUrl?: string;
};

export type DeviceLogin = {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
};

export type SyncState = {
  initialized: boolean;
  provider: SyncProvider | null;
  status: SyncStatus;
  user: SyncUser | null;
  gistId: string;
  gistUrl: string;
  lastSyncedAt: string;
  error: string;
  deviceLogin: DeviceLogin | null;
};

export const useSyncStore = defineStore("sync", () => {
  const sync = reactive<SyncState>({
    initialized: false,
    provider: null,
    status: "idle",
    user: null,
    gistId: "",
    gistUrl: "",
    lastSyncedAt: "",
    error: "",
    deviceLogin: null
  });

  const setSync = <T extends keyof SyncState>(key: T, value: SyncState[T]) => {
    sync[key] = value;
  };

  const setConnected = (data: {
    user: SyncUser;
    gistId: string;
    gistUrl: string;
    lastSyncedAt?: string;
  }) => {
    sync.provider = "github";
    sync.status = "connected";
    sync.user = data.user;
    sync.gistId = data.gistId;
    sync.gistUrl = data.gistUrl;
    sync.lastSyncedAt = data.lastSyncedAt ?? "";
    sync.error = "";
    sync.deviceLogin = null;
  };

  const reset = () => {
    sync.provider = null;
    sync.status = "idle";
    sync.user = null;
    sync.gistId = "";
    sync.gistUrl = "";
    sync.lastSyncedAt = "";
    sync.error = "";
    sync.deviceLogin = null;
  };

  return {
    sync,
    setSync,
    setConnected,
    reset
  };
});

import { create } from "zustand";
import { User } from "@capacitor-firebase/authentication";
import { Preferences } from "@capacitor/preferences";
import { credentialStore, normalizeDeviceKey } from "@/lib/crypto/credentials";
import { logger } from "@/lib/logger";
import {
  IndexResponse,
  InboxMessage,
  PlayingResponse,
  ScrapingStatusNotification,
  TokenResponse,
} from "./models";
import { SafeAreaInsets } from "./safeArea";

const defaultSafeAreaInsets: SafeAreaInsets = {
  top: "0px",
  bottom: "0px",
  left: "0px",
  right: "0px",
};

export enum ConnectionState {
  IDLE = "IDLE",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
  ERROR = "ERROR",
  DISCONNECTED = "DISCONNECTED",
}

export interface DeviceHistoryEntry {
  address: string;
  name?: string;
  nameIsCustom?: boolean;
  platform?: string;
  version?: string;
  lastConnectedAt?: number;
  paired?: { clientId: string; pairedAt: number; label?: string };
}

export type DeviceHistoryMeta = Partial<
  Pick<
    DeviceHistoryEntry,
    "name" | "platform" | "version" | "lastConnectedAt" | "paired"
  >
>;

export type EncryptionState = "unknown" | "plaintext" | "encrypted";

export interface StagedTokenState {
  token: TokenResponse;
  ready: boolean;
}

interface StatusState {
  connected: boolean;
  setConnected: (status: boolean) => void;

  // Target device address - triggers WebSocket reconnection when changed
  targetDeviceAddress: string;
  setTargetDeviceAddress: (address: string) => void;

  connectionState: ConnectionState;
  setConnectionState: (state: ConnectionState) => void;

  lastConnectionTime: number | null;
  setLastConnectionTime: (time: number | null) => void;

  connectionError: string;
  setConnectionError: (error: string) => void;

  retryCount: number;
  retryConnection: () => void;

  lastToken: TokenResponse;
  setLastToken: (token: TokenResponse) => void;

  activeTokens: TokenResponse[];
  setActiveTokens: (tokens: TokenResponse[]) => void;
  clearActiveTokens: () => void;

  stagedToken: StagedTokenState | null;
  setStagedToken: (stagedToken: StagedTokenState | null) => void;
  clearStagedToken: () => void;

  gamesIndex: IndexResponse;
  setGamesIndex: (index: IndexResponse) => void;

  scrapingStatus: ScrapingStatusNotification | null;
  setScrapingStatus: (status: ScrapingStatusNotification | null) => void;

  playing: PlayingResponse;
  setPlaying: (playing: PlayingResponse) => void;

  cameraOpen: boolean;
  setCameraOpen: (cameraOpen: boolean) => void;

  loggedInUser: User | null;
  setLoggedInUser: (loggedInUser: User | null) => void;

  nfcModalOpen: boolean;
  setNfcModalOpen: (nfcModalOpen: boolean) => void;

  proPurchaseModalOpen: boolean;
  setProPurchaseModalOpen: (proPurchaseModalOpen: boolean) => void;

  writeOpen: boolean;
  setWriteOpen: (writeOpen: boolean) => void;

  safeInsets: SafeAreaInsets;
  setSafeInsets: (insets: SafeAreaInsets) => void;

  deviceHistory: DeviceHistoryEntry[];
  setDeviceHistory: (history: DeviceHistoryEntry[]) => void;
  addDeviceHistory: (address: string) => void;
  removeDeviceHistory: (address: string) => void;
  clearDeviceHistory: () => void;
  updateDeviceHistoryMeta: (
    address: string,
    meta: DeviceHistoryMeta,
    opts?: { source?: "auto" | "manual" },
  ) => void;

  runQueue: { value: string; unsafe: boolean } | null;
  setRunQueue: (runQueue: { value: string; unsafe: boolean } | null) => void;

  writeQueue: string;
  setWriteQueue: (writeQueue: string) => void;

  coreVersion: string | null;
  corePlatform: string | null;
  setCoreVersion: (version: string | null) => void;
  setCorePlatform: (platform: string | null) => void;
  coreVersionPending: boolean;
  setCoreVersionPending: (pending: boolean) => void;

  encryptionState: EncryptionState;
  setEncryptionState: (state: EncryptionState) => void;

  pairingRequired: boolean;
  setPairingRequired: (required: boolean) => void;

  inboxMessages: InboxMessage[];
  setInboxMessages: (messages: InboxMessage[]) => void;
  addInboxMessage: (message: InboxMessage) => void;
  removeInboxMessage: (id: number) => void;

  inboxModalOpen: boolean;
  setInboxModalOpen: (open: boolean) => void;

  resetConnectionState: () => void;
}

export const DEFAULT_GAMES_INDEX: IndexResponse = {
  exists: false,
  indexing: false,
  optimizing: false,
  totalSteps: 0,
  currentStep: 0,
  currentStepDisplay: "",
  totalFiles: 0,
  totalMedia: undefined,
};

export const useStatusStore = create<StatusState>()((set) => ({
  connected: false,
  setConnected: (status) => set({ connected: status }),

  targetDeviceAddress: "", // Initialized empty, will be set by ConnectionProvider on mount
  setTargetDeviceAddress: (address) => set({ targetDeviceAddress: address }),

  connectionState: ConnectionState.IDLE,
  setConnectionState: (state) =>
    set({
      connectionState: state,
      // Treat RECONNECTING as "connected enough" to show cached data and enable UI
      connected:
        state === ConnectionState.CONNECTED ||
        state === ConnectionState.RECONNECTING,
    }),

  lastConnectionTime: null,
  setLastConnectionTime: (time) => set({ lastConnectionTime: time }),

  connectionError: "",
  setConnectionError: (error) => set({ connectionError: error }),

  retryCount: 0,
  retryConnection: () => set((state) => ({ retryCount: state.retryCount + 1 })),

  lastToken: { type: "", uid: "", text: "", data: "", scanTime: "" },
  setLastToken: (token) => set({ lastToken: token }),

  activeTokens: [],
  setActiveTokens: (tokens) => set({ activeTokens: tokens }),
  clearActiveTokens: () => set({ activeTokens: [] }),

  stagedToken: null,
  setStagedToken: (stagedToken) => set({ stagedToken }),
  clearStagedToken: () => set({ stagedToken: null }),

  gamesIndex: {
    exists: true,
    indexing: false,
    optimizing: false,
    totalSteps: 0,
    currentStep: 0,
    currentStepDisplay: "",
    totalFiles: 0,
  },
  setGamesIndex: (index) => set({ gamesIndex: index }),

  scrapingStatus: null,
  setScrapingStatus: (status) => set({ scrapingStatus: status }),

  playing: {
    systemId: "",
    systemName: "",
    mediaName: "",
    mediaPath: "",
  },
  setPlaying: (playing) => set({ playing }),

  cameraOpen: false,
  setCameraOpen: (cameraOpen) => set({ cameraOpen: cameraOpen }),

  loggedInUser: null,
  setLoggedInUser: (loggedInUser: User | null) =>
    set({ loggedInUser: loggedInUser }),

  nfcModalOpen: false,
  setNfcModalOpen: (nfcModalOpen) => set({ nfcModalOpen }),

  proPurchaseModalOpen: false,
  setProPurchaseModalOpen: (proPurchaseModalOpen) =>
    set({ proPurchaseModalOpen }),

  writeOpen: false,
  setWriteOpen: (writeOpen) => set({ writeOpen }),

  safeInsets: defaultSafeAreaInsets,
  setSafeInsets: (insets) => set({ safeInsets: insets }),

  deviceHistory: [],
  setDeviceHistory: (history: DeviceHistoryEntry[]) =>
    set({ deviceHistory: history }),
  addDeviceHistory: (address) =>
    set((state) => {
      // Preserve any existing metadata (name, platform, version, paired, etc.)
      // — re-adding on reconnect must not wipe fields populated by earlier paths.
      const existing = state.deviceHistory.find(
        (entry) => entry.address === address,
      );
      const devices = [
        ...state.deviceHistory.filter((entry) => entry.address !== address),
        existing ? { ...existing, address } : { address },
      ];
      Preferences.set({
        key: "deviceHistory",
        value: JSON.stringify(devices),
      }).catch((err) => {
        logger.warn("Preferences.set failed saving deviceHistory", err, {
          category: "storage",
          action: "addDeviceHistory",
          severity: "warning",
        });
      });
      return {
        deviceHistory: devices,
      };
    }),
  removeDeviceHistory: (address) =>
    set((state) => {
      const devices = state.deviceHistory.filter(
        (entry) => entry.address !== address,
      );
      Preferences.set({
        key: "deviceHistory",
        value: JSON.stringify(devices),
      }).catch((err) => {
        logger.warn("Preferences.set failed saving deviceHistory", err, {
          category: "storage",
          action: "removeDeviceHistory",
          severity: "warning",
        });
      });
      // Removing a device clears any stored pairing — encryption credentials
      // and the device entry are managed as one unit.
      credentialStore.delete(normalizeDeviceKey(address)).catch((err) => {
        logger.error("Failed to delete credentials for removed device", err, {
          category: "storage",
          action: "deleteCredentials",
          severity: "error",
        });
      });
      return {
        deviceHistory: devices,
      };
    }),
  clearDeviceHistory: () => {
    Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([]),
    }).catch((err) => {
      logger.warn("Preferences.set failed saving deviceHistory", err, {
        category: "storage",
        action: "clearDeviceHistory",
        severity: "warning",
      });
    });
    set((state) => {
      // Wipe credentials for every removed device.
      for (const entry of state.deviceHistory) {
        credentialStore
          .delete(normalizeDeviceKey(entry.address))
          .catch((err) => {
            logger.error(
              "Failed to delete credentials during clearDeviceHistory",
              err,
              {
                category: "storage",
                action: "deleteCredentials",
                severity: "error",
              },
            );
          });
      }
      return { deviceHistory: [] };
    });
  },
  updateDeviceHistoryMeta: (address, meta, opts) =>
    set((state) => {
      const idx = state.deviceHistory.findIndex(
        (entry) => entry.address === address,
      );
      const existing = state.deviceHistory[idx];
      if (!existing) return {};
      const source = opts?.source ?? "auto";
      const next: DeviceHistoryEntry = { ...existing };
      if (source === "auto") {
        if (meta.platform !== undefined) next.platform = meta.platform;
        if (meta.version !== undefined) next.version = meta.version;
        if (meta.lastConnectedAt !== undefined)
          next.lastConnectedAt = meta.lastConnectedAt;
        // Auto callers (e.g. ZeroConf scan with an unset service name) may
        // pass `""` — treat that as "no information" rather than overwriting
        // a previously-good name with a blank.
        if (meta.name && !existing.nameIsCustom) {
          next.name = meta.name;
        }
      } else {
        if (meta.platform !== undefined) next.platform = meta.platform;
        if (meta.version !== undefined) next.version = meta.version;
        if (meta.lastConnectedAt !== undefined)
          next.lastConnectedAt = meta.lastConnectedAt;
        if ("name" in meta) {
          if (meta.name === undefined || meta.name === "") {
            next.name = undefined;
            next.nameIsCustom = false;
          } else {
            next.name = meta.name;
            next.nameIsCustom = true;
          }
        }
      }
      if ("paired" in meta) next.paired = meta.paired;
      const devices = [...state.deviceHistory];
      devices[idx] = next;
      Preferences.set({
        key: "deviceHistory",
        value: JSON.stringify(devices),
      }).catch((err) => {
        logger.warn("Preferences.set failed saving deviceHistory", err, {
          category: "storage",
          action: "updateDeviceHistoryMeta",
          severity: "warning",
        });
      });
      return { deviceHistory: devices };
    }),
  runQueue: null,
  setRunQueue: (runQueue) => set({ runQueue }),
  writeQueue: "",
  setWriteQueue: (writeQueue) => set({ writeQueue }),

  coreVersion: null,
  corePlatform: null,
  setCoreVersion: (version) => set({ coreVersion: version }),
  setCorePlatform: (platform) => set({ corePlatform: platform }),
  coreVersionPending: false,
  setCoreVersionPending: (pending) => set({ coreVersionPending: pending }),

  encryptionState: "unknown",
  setEncryptionState: (state) => set({ encryptionState: state }),

  pairingRequired: false,
  setPairingRequired: (required) => set({ pairingRequired: required }),

  inboxMessages: [],
  setInboxMessages: (messages) => set({ inboxMessages: messages }),
  addInboxMessage: (message) =>
    set((state) => {
      // Dedupe by id — Core's category upsert can re-emit the same id.
      const filtered = state.inboxMessages.filter((m) => m.id !== message.id);
      return { inboxMessages: [message, ...filtered] };
    }),
  removeInboxMessage: (id) =>
    set((state) => ({
      inboxMessages: state.inboxMessages.filter((m) => m.id !== id),
    })),

  inboxModalOpen: false,
  setInboxModalOpen: (open) => set({ inboxModalOpen: open }),

  resetConnectionState: () => {
    // Reset all connection-related state
    set({
      connected: false,
      connectionState: ConnectionState.IDLE,
      lastConnectionTime: null,
      connectionError: "",
      retryCount: 0,
      runQueue: null,
      writeQueue: "",
      // Reset media-related state that will be refetched on reconnect
      lastToken: { type: "", uid: "", text: "", data: "", scanTime: "" },
      activeTokens: [],
      stagedToken: null,
      gamesIndex: {
        exists: true,
        indexing: false,
        optimizing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 0,
      },
      scrapingStatus: null,
      playing: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      },
      coreVersion: null,
      corePlatform: null,
      coreVersionPending: false,
      encryptionState: "unknown",
      pairingRequired: false,
      inboxMessages: [],
      inboxModalOpen: false,
    });
  },
}));

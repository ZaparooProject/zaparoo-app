import { create } from "zustand";
import { User } from "@capacitor-firebase/authentication";
import { Preferences } from "@capacitor/preferences";
import { IndexResponse, PlayingResponse, TokenResponse } from "./models";
import { SafeAreaInsets } from "./safeArea";

const defaultSafeAreaInsets: SafeAreaInsets = {
  top: "0px",
  bottom: "0px", 
  left: "0px",
  right: "0px"
};

export enum ConnectionState {
  IDLE = "IDLE",
  CONNECTING = "CONNECTING", 
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
  ERROR = "ERROR",
  DISCONNECTED = "DISCONNECTED"
}

export interface DeviceHistoryEntry {
  address: string;
}

interface StatusState {
  connected: boolean;
  setConnected: (status: boolean) => void;

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

  gamesIndex: IndexResponse;
  setGamesIndex: (index: IndexResponse) => void;

  playing: PlayingResponse;
  setPlaying: (playing: PlayingResponse) => void;

  cameraOpen: boolean;
  setCameraOpen: (cameraOpen: boolean) => void;

  loggedInUser: User | null;
  setLoggedInUser: (loggedInUser: User | null) => void;

  nfcModalOpen: boolean;
  setNfcModalOpen: (nfcModalOpen: boolean) => void;

  safeInsets: SafeAreaInsets;
  setSafeInsets: (insets: SafeAreaInsets) => void;

  deviceHistory: DeviceHistoryEntry[];
  setDeviceHistory: (history: DeviceHistoryEntry[]) => void;
  addDeviceHistory: (address: string) => void;
  removeDeviceHistory: (address: string) => void;
  clearDeviceHistory: () => void;

  runQueue: { value: string; unsafe: boolean } | null;
  setRunQueue: (runQueue: { value: string; unsafe: boolean } | null) => void;

  writeQueue: string;
  setWriteQueue: (writeQueue: string) => void;

  // Grace period for connection state changes
  pendingDisconnection: boolean;
  gracePeriodTimer?: ReturnType<typeof setTimeout>;
  setConnectionStateWithGracePeriod: (state: ConnectionState) => void;
  clearGracePeriod: () => void;
}

export const useStatusStore = create<StatusState>()((set) => ({
  connected: false,
  setConnected: (status) => set({ connected: status }),

  connectionState: ConnectionState.IDLE,
  setConnectionState: (state) => set({ 
    connectionState: state,
    connected: state === ConnectionState.CONNECTED
  }),

  lastConnectionTime: null,
  setLastConnectionTime: (time) => set({ lastConnectionTime: time }),

  connectionError: "",
  setConnectionError: (error) => set({ connectionError: error }),

  retryCount: 0,
  retryConnection: () => set((state) => ({ retryCount: state.retryCount + 1 })),

  lastToken: { type: "", uid: "", text: "", data: "", scanTime: "" },
  setLastToken: (token) => set({ lastToken: token }),

  gamesIndex: {
    exists: true,
    indexing: false,
    totalSteps: 0,
    currentStep: 0,
    currentStepDisplay: "",
    totalFiles: 0
  },
  setGamesIndex: (index) => set({ gamesIndex: index }),

  playing: {
    systemId: "",
    systemName: "",
    mediaName: "",
    mediaPath: ""
  },
  setPlaying: (playing) => set({ playing }),

  cameraOpen: false,
  setCameraOpen: (cameraOpen) => set({ cameraOpen: cameraOpen }),

  loggedInUser: null,
  setLoggedInUser: (loggedInUser: User | null) =>
    set({ loggedInUser: loggedInUser }),

  nfcModalOpen: false,
  setNfcModalOpen: (nfcModalOpen) => set({ nfcModalOpen }),

  safeInsets: defaultSafeAreaInsets,
  setSafeInsets: (insets) => set({ safeInsets: insets }),

  deviceHistory: [],
  setDeviceHistory: (history: DeviceHistoryEntry[]) =>
    set({ deviceHistory: history }),
  addDeviceHistory: (address) =>
    set((state) => {
      const devices = [
        ...state.deviceHistory.filter((entry) => entry.address !== address),
        { address }
      ];
      Preferences.set({
        key: "deviceHistory",
        value: JSON.stringify(devices)
      });
      return {
        deviceHistory: devices
      };
    }),
  removeDeviceHistory: (address) =>
    set((state) => {
      const devices = state.deviceHistory.filter(
        (entry) => entry.address !== address
      );
      Preferences.set({
        key: "deviceHistory",
        value: JSON.stringify(devices)
      });
      return {
        deviceHistory: devices
      };
    }),
  clearDeviceHistory: () => {
    Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([])
    });
    set({ deviceHistory: [] });
  },
  runQueue: null,
  setRunQueue: (runQueue) => set({ runQueue }),
  writeQueue: "",
  setWriteQueue: (writeQueue) => set({ writeQueue }),

  // Grace period state and methods
  pendingDisconnection: false,

  setConnectionStateWithGracePeriod: (state) => {
    const currentState = useStatusStore.getState();
    const GRACE_PERIOD_MS = 2000; // 2 second grace period

    // Immediate state changes that bypass grace period
    if (state === ConnectionState.CONNECTED ||
        state === ConnectionState.ERROR ||
        state === ConnectionState.CONNECTING) {
      // Clear any pending disconnection
      if (currentState.gracePeriodTimer) {
        clearTimeout(currentState.gracePeriodTimer);
      }
      set({
        connectionState: state,
        connected: state === ConnectionState.CONNECTED,
        pendingDisconnection: false,
        gracePeriodTimer: undefined
      });
      return;
    }

    // Only apply grace period for disconnection states when currently connected
    if ((state === ConnectionState.RECONNECTING || state === ConnectionState.DISCONNECTED) &&
        currentState.connectionState === ConnectionState.CONNECTED) {

      // Clear any existing timer
      if (currentState.gracePeriodTimer) {
        clearTimeout(currentState.gracePeriodTimer);
      }

      // Set pending disconnection but don't change UI state yet
      const timer = setTimeout(() => {
        set({
          connectionState: state,
          connected: false,
          pendingDisconnection: false,
          gracePeriodTimer: undefined
        });
      }, GRACE_PERIOD_MS);

      set({
        pendingDisconnection: true,
        gracePeriodTimer: timer
      });
    } else {
      // Immediate change for other cases (e.g., not previously connected)
      set({
        connectionState: state,
        connected: false, // These states are never connected
        pendingDisconnection: false
      });
    }
  },

  clearGracePeriod: () => {
    const currentState = useStatusStore.getState();
    if (currentState.gracePeriodTimer) {
      clearTimeout(currentState.gracePeriodTimer);
    }
    set({
      pendingDisconnection: false,
      gracePeriodTimer: undefined
    });
  }
}));

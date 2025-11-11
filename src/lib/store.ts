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

  resetConnectionState: () => void;
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
    optimizing: false,
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
      gamesIndex: {
        exists: true,
        indexing: false,
        optimizing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 0
      },
      playing: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: ""
      }
    });
  }
}));

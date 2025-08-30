import { create } from "zustand";
import { User } from "@capacitor-firebase/authentication";
import { Preferences } from "@capacitor/preferences";
import { IndexResponse, PlayingResponse, TokenResponse } from "./models";
import { defaultSafeAreaInsets, SafeAreaInsets } from "./safeArea";

export interface DeviceHistoryEntry {
  address: string;
}

interface StatusState {
  connected: boolean;
  setConnected: (status: boolean) => void;

  connectionError: string;
  setConnectionError: (error: string) => void;

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
}

export const useStatusStore = create<StatusState>()((set) => ({
  connected: false,
  setConnected: (status) => set({ connected: status }),

  connectionError: "",
  setConnectionError: (error) => set({ connectionError: error }),

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
  setWriteQueue: (writeQueue) => set({ writeQueue })
}));

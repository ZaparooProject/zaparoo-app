import { create } from "zustand";
import { IndexResponse, PlayingResponse, TokenResponse } from "./models";
import { User } from "@capacitor-firebase/authentication";

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
    set({ loggedInUser: loggedInUser })
}));

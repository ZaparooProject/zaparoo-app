import { vi } from "vitest";

export const FirebaseAuthentication = {
  addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  getIdToken: vi.fn().mockResolvedValue({ token: "" }),
  setLanguageCode: vi.fn().mockResolvedValue(undefined),
  signInWithEmailAndPassword: vi.fn().mockResolvedValue({ user: null }),
  createUserWithEmailAndPassword: vi.fn().mockResolvedValue({ user: null }),
  signInWithGoogle: vi.fn().mockResolvedValue({ user: null }),
  signInWithApple: vi.fn().mockResolvedValue({ user: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
  useAppLanguage: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
};

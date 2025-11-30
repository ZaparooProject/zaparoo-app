export const CapacitorNfc = {
  isSupported: vi.fn().mockResolvedValue({ isSupported: true }),
  isEnabled: vi.fn().mockResolvedValue({ isEnabled: true }),
  openSettings: vi.fn().mockResolvedValue(undefined),
  checkPermissions: vi.fn().mockResolvedValue({ nfc: "granted" }),
  requestPermissions: vi.fn().mockResolvedValue({ nfc: "granted" }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
  startSession: vi.fn().mockResolvedValue(undefined),
  stopSession: vi.fn().mockResolvedValue(undefined),
  write: vi.fn().mockResolvedValue(undefined),
};

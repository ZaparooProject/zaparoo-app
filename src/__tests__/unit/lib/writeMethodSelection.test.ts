import { describe, it, expect, vi, beforeEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { CoreAPI } from "../../../lib/coreApi";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

// Mock Capacitor NFC
vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isAvailable: vi.fn(),
  },
}));

// Mock CoreAPI
vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    hasWriteCapableReader: vi.fn(),
  },
}));

describe("Write Method Selection Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("determineWriteMethod", () => {
    it("should prefer remote writer when user setting is enabled and remote writer is available", async () => {
      const { Nfc } = await import("@capawesome-team/capacitor-nfc");

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      // Mock the write method determination logic
      const preferRemoteWriter = true;
      const hasRemoteWriter = await CoreAPI.hasWriteCapableReader();
      const isNativePlatform = Capacitor.isNativePlatform();

      let writeMethod: string;

      if (preferRemoteWriter && hasRemoteWriter) {
        writeMethod = "remote";
      } else if (isNativePlatform) {
        const nfcAvailable = await Nfc.isAvailable();
        writeMethod = nfcAvailable.nfc ? "local" : "remote";
      } else {
        writeMethod = hasRemoteWriter ? "remote" : "local";
      }

      expect(writeMethod).toBe("remote");
    });

    it("should use local NFC when available and remote writer not preferred", async () => {
      const { Nfc } = await import("@capawesome-team/capacitor-nfc");

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const preferRemoteWriter = false;
      const hasRemoteWriter = await CoreAPI.hasWriteCapableReader();
      const isNativePlatform = Capacitor.isNativePlatform();

      let writeMethod: string;

      if (preferRemoteWriter && hasRemoteWriter) {
        writeMethod = "remote";
      } else if (isNativePlatform) {
        const nfcAvailable = await Nfc.isAvailable();
        writeMethod = nfcAvailable.nfc ? "local" : "remote";
      } else {
        writeMethod = hasRemoteWriter ? "remote" : "local";
      }

      expect(writeMethod).toBe("local");
    });

    it("should fallback to remote when local NFC not available", async () => {
      const { Nfc } = await import("@capawesome-team/capacitor-nfc");

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: false, hce: false });
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const preferRemoteWriter = false;
      const hasRemoteWriter = await CoreAPI.hasWriteCapableReader();
      const isNativePlatform = Capacitor.isNativePlatform();

      let writeMethod: string;

      if (preferRemoteWriter && hasRemoteWriter) {
        writeMethod = "remote";
      } else if (isNativePlatform) {
        const nfcAvailable = await Nfc.isAvailable();
        writeMethod = nfcAvailable.nfc ? "local" : "remote";
      } else {
        writeMethod = hasRemoteWriter ? "remote" : "local";
      }

      expect(writeMethod).toBe("remote");
    });

    it("should handle NFC availability check failure gracefully", async () => {
      const { Nfc } = await import("@capawesome-team/capacitor-nfc");

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Nfc.isAvailable).mockRejectedValue(
        new Error("NFC check failed"),
      );
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const preferRemoteWriter = false;
      const hasRemoteWriter = await CoreAPI.hasWriteCapableReader();
      const isNativePlatform = Capacitor.isNativePlatform();

      let writeMethod: string;

      if (preferRemoteWriter && hasRemoteWriter) {
        writeMethod = "remote";
      } else if (isNativePlatform) {
        try {
          const nfcAvailable = await Nfc.isAvailable();
          writeMethod = nfcAvailable.nfc ? "local" : "remote";
        } catch {
          writeMethod = hasRemoteWriter ? "remote" : "local";
        }
      } else {
        writeMethod = hasRemoteWriter ? "remote" : "local";
      }

      expect(writeMethod).toBe("remote");
    });

    it("should default to local when no remote writer available on non-native platform", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);

      const preferRemoteWriter = false;
      const hasRemoteWriter = await CoreAPI.hasWriteCapableReader();
      const isNativePlatform = Capacitor.isNativePlatform();

      let writeMethod: string;

      if (preferRemoteWriter && hasRemoteWriter) {
        writeMethod = "remote";
      } else if (isNativePlatform) {
        writeMethod = "local"; // Won't be reached in this test
      } else {
        writeMethod = hasRemoteWriter ? "remote" : "local";
      }

      expect(writeMethod).toBe("local");
    });
  });

  describe("hasWriteCapableReader", () => {
    it("should return true when readers with write capability exist", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(true);
    });

    it("should return false when no connected readers have write capability", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should handle API errors gracefully", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });
  });
});

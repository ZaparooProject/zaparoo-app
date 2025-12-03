/**
 * Unit tests for writeNfcHook (useNfcWriter hook)
 *
 * Tests the write method selection logic, abort handling,
 * and action routing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useNfcWriter,
  WriteMethod,
  WriteAction,
} from "../../../lib/writeNfcHook";
import { Status } from "../../../lib/nfc";

// Create hoisted mocks
const {
  mockIsNativePlatform,
  mockGetPlatform,
  mockNfcIsAvailable,
  mockCancelSession,
  mockReadRaw,
  mockWriteTag,
  mockFormatTag,
  mockEraseTag,
  mockMakeReadOnly,
  mockHasWriteCapableReader,
  mockWrite,
  mockReadersWriteCancel,
  mockCancelWrite,
  mockToast,
  mockLogger,
} = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn().mockReturnValue(true),
  mockGetPlatform: vi.fn().mockReturnValue("ios"),
  mockNfcIsAvailable: vi.fn().mockResolvedValue({ nfc: true }),
  mockCancelSession: vi.fn().mockResolvedValue(undefined),
  mockReadRaw: vi.fn(),
  mockWriteTag: vi.fn(),
  mockFormatTag: vi.fn(),
  mockEraseTag: vi.fn(),
  mockMakeReadOnly: vi.fn(),
  mockHasWriteCapableReader: vi.fn().mockResolvedValue(false),
  mockWrite: vi.fn().mockResolvedValue({}),
  mockReadersWriteCancel: vi.fn().mockResolvedValue(undefined),
  mockCancelWrite: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
  mockLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
    getPlatform: mockGetPlatform,
  },
}));

// Mock NFC plugin
vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isAvailable: mockNfcIsAvailable,
  },
}));

// Mock NFC operations
vi.mock("../../../lib/nfc", () => ({
  cancelSession: mockCancelSession,
  readRaw: mockReadRaw,
  writeTag: mockWriteTag,
  formatTag: mockFormatTag,
  eraseTag: mockEraseTag,
  makeReadOnly: mockMakeReadOnly,
  Status: {
    Success: 0,
    Error: 1,
    Cancelled: 2,
  },
}));

// Mock CoreAPI
vi.mock("../../../lib/coreApi.ts", () => ({
  CoreAPI: {
    hasWriteCapableReader: mockHasWriteCapableReader,
    write: mockWrite,
    readersWriteCancel: mockReadersWriteCancel,
    cancelWrite: mockCancelWrite,
  },
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: mockToast,
}));

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: mockLogger,
}));

// Mock images
vi.mock("../../../lib/images", () => ({
  CheckIcon: () => null,
  WarningIcon: () => null,
}));

describe("useNfcWriter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default to native platform with NFC available
    mockIsNativePlatform.mockReturnValue(true);
    mockGetPlatform.mockReturnValue("ios");
    mockNfcIsAvailable.mockResolvedValue({ nfc: true });
    mockHasWriteCapableReader.mockResolvedValue(false);

    // Default successful operations
    mockReadRaw.mockResolvedValue({
      status: Status.Success,
      info: { rawTag: null, tag: { uid: "test", text: "" } },
    });
    mockWriteTag.mockResolvedValue({
      status: Status.Success,
      info: { rawTag: null, tag: { uid: "test", text: "content" } },
    });
    mockFormatTag.mockResolvedValue({
      status: Status.Success,
      info: { rawTag: null, tag: { uid: "test", text: "" } },
    });
    mockEraseTag.mockResolvedValue({
      status: Status.Success,
      info: { rawTag: null, tag: { uid: "test", text: "" } },
    });
    mockMakeReadOnly.mockResolvedValue({
      status: Status.Success,
      info: { rawTag: null, tag: { uid: "test", text: "" } },
    });
    mockWrite.mockResolvedValue({});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("initialization", () => {
    it("should return initial state", () => {
      const { result } = renderHook(() => useNfcWriter());

      expect(result.current.writing).toBe(false);
      expect(result.current.result).toBeNull();
      expect(result.current.status).toBeNull();
      expect(typeof result.current.write).toBe("function");
      expect(typeof result.current.end).toBe("function");
    });
  });

  describe("write method selection", () => {
    it("should use LocalNFC when native platform has NFC", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      mockNfcIsAvailable.mockResolvedValue({ nfc: true });

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "test content");
      });

      // Should use writeTag (local NFC)
      expect(mockWriteTag).toHaveBeenCalledWith("test content");
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("should use RemoteReader when user prefers remote and it's available", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      mockHasWriteCapableReader.mockResolvedValue(true);

      // Use hook with preferRemoteWriter=true
      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, true));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test content");
      });

      // Should use CoreAPI.write (remote)
      expect(mockWrite).toHaveBeenCalled();
      expect(mockWriteTag).not.toHaveBeenCalled();
    });

    it("should fallback to RemoteReader when NFC not available", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      mockNfcIsAvailable.mockResolvedValue({ nfc: false });
      mockHasWriteCapableReader.mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "test content");
      });

      expect(mockWrite).toHaveBeenCalled();
    });

    it("should use RemoteReader on non-native platforms", async () => {
      mockIsNativePlatform.mockReturnValue(false);
      mockHasWriteCapableReader.mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "test content");
      });

      expect(mockWrite).toHaveBeenCalled();
    });

    it("should use explicit LocalNFC method when specified", async () => {
      mockIsNativePlatform.mockReturnValue(true);

      const { result } = renderHook(() => useNfcWriter(WriteMethod.LocalNFC));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test content");
      });

      expect(mockWriteTag).toHaveBeenCalledWith("test content");
    });

    it("should use explicit RemoteReader method when specified", async () => {
      mockWrite.mockResolvedValue({});

      const { result } = renderHook(() =>
        useNfcWriter(WriteMethod.RemoteReader),
      );

      await act(async () => {
        await result.current.write(WriteAction.Write, "test content");
      });

      expect(mockWrite).toHaveBeenCalled();
    });
  });

  describe("write actions", () => {
    it("should handle Read action", async () => {
      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Read);
      });

      expect(mockReadRaw).toHaveBeenCalled();
    });

    it("should handle Format action on Android", async () => {
      mockGetPlatform.mockReturnValue("android");

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Format);
      });

      expect(mockFormatTag).toHaveBeenCalled();
    });

    it("should not format on non-Android platforms", async () => {
      mockGetPlatform.mockReturnValue("ios");

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Format);
      });

      expect(mockFormatTag).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Format is only supported on Android",
        expect.any(Object),
      );
    });

    it("should handle Erase action", async () => {
      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Erase);
      });

      expect(mockEraseTag).toHaveBeenCalled();
    });

    it("should handle MakeReadOnly action", async () => {
      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.MakeReadOnly);
      });

      expect(mockMakeReadOnly).toHaveBeenCalled();
    });

    it("should require text for Write action", async () => {
      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write);
      });

      expect(mockWriteTag).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "No text provided to write",
        expect.any(Object),
      );
    });
  });

  describe("status handling", () => {
    it("should set status to Success on successful write", async () => {
      mockWriteTag.mockResolvedValue({
        status: Status.Success,
        info: { rawTag: null, tag: { uid: "test", text: "content" } },
      });

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "content");
      });

      await waitFor(() => {
        expect(result.current.status).toBe(Status.Success);
      });

      expect(mockToast.success).toHaveBeenCalled();
    });

    it("should set status to Cancelled on cancelled write", async () => {
      mockWriteTag.mockResolvedValue({
        status: Status.Cancelled,
        info: { rawTag: null, tag: null },
      });

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "content");
      });

      await waitFor(() => {
        expect(result.current.status).toBe(Status.Cancelled);
      });

      // No toast for cancelled
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it("should set status to Error on failed write", async () => {
      mockWriteTag.mockRejectedValue(new Error("Write failed"));

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "content");
      });

      await waitFor(() => {
        expect(result.current.status).toBe(Status.Error);
      });

      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  describe("end() cancellation", () => {
    it("should reset state on end()", async () => {
      const { result } = renderHook(() => useNfcWriter());

      // Call end (doesn't need active write)
      await act(async () => {
        await result.current.end();
      });

      // State should be reset
      expect(result.current.writing).toBe(false);
      expect(result.current.status).toBeNull();
    });
  });

  describe("writing state", () => {
    it("should set writing=false after operation completes", async () => {
      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "content");
      });

      // After completion, writing should be false
      expect(result.current.writing).toBe(false);
    });

    it("should have result after successful operation", async () => {
      mockWriteTag.mockResolvedValue({
        status: Status.Success,
        info: { rawTag: null, tag: { uid: "test", text: "content" } },
      });

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "content");
      });

      expect(result.current.result).not.toBeNull();
      expect(result.current.status).toBe(Status.Success);
    });
  });

  describe("cleanup on unmount", () => {
    it("should cancel session on unmount", () => {
      const { unmount } = renderHook(() => useNfcWriter());

      unmount();

      expect(mockCancelSession).toHaveBeenCalled();
    });
  });
});

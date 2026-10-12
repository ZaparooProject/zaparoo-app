import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { useStatusStore } from "@/lib/store";
import { WriteAction } from "@/lib/writeNfcHook";
import { cancelSession, sessionManager } from "@/lib/nfc";

const { mockWriter } = vi.hoisted(() => ({
  mockWriter: {
    write: vi.fn(),
    end: vi.fn(),
    retry: vi.fn(),
    getVerifyError: vi.fn(() => null),
    verifyError: null,
    retapRequired: false,
    result: null,
  },
}));

vi.mock("@/lib/writeNfcHook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/writeNfcHook")>()),
  useNfcWriter: () => mockWriter,
}));

vi.mock("@/lib/nfc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nfc")>();
  return {
    ...actual,
    cancelSession: vi.fn(async () => {
      actual.sessionManager.setIsScanning(false);
    }),
    waitForSessionRelease: vi.fn().mockResolvedValue(true),
  };
});

const initialStatusState = { ...useStatusStore.getState() };

describe("useContextualNfcWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState({ ...initialStatusState });
    sessionManager.setIsScanning(false);
    // The tag is never presented unless a test settles the operation.
    mockWriter.write.mockImplementation(() => new Promise<void>(() => {}));
    mockWriter.end.mockResolvedValue(undefined);
  });

  const renderWrite = (
    initialProps: { contextKey: string | null; enabled: boolean } = {
      contextKey: "media-a",
      enabled: true,
    },
  ) =>
    renderHook(
      ({ contextKey, enabled }) => useContextualNfcWrite(contextKey, enabled),
      { initialProps },
    );

  it("writes text by default and waits for the tag", async () => {
    const { result } = renderWrite();

    act(() => void result.current.start("**launch.system:snes"));

    await waitFor(() =>
      expect(mockWriter.write).toHaveBeenCalledWith(
        WriteAction.Write,
        "**launch.system:snes",
      ),
    );
    expect(result.current.state).toBe("waiting");
    expect(result.current.activeLabel).toBe("spinner.holdTagReader");
  });

  it("runs a read or tool action without text", async () => {
    const { result } = renderWrite();

    act(() => void result.current.start("", WriteAction.Erase));

    await waitFor(() =>
      expect(mockWriter.write).toHaveBeenCalledWith(
        WriteAction.Erase,
        undefined,
      ),
    );
    expect(result.current.active).toBe(true);
  });

  it("refuses to start while a queued or deep-link write owns the reader", async () => {
    useStatusStore.setState({ writeQueue: "**launch.system:nes" });
    const { result } = renderWrite();
    expect(result.current.externalWriteActive).toBe(true);

    await act(() => result.current.start("**launch.system:snes"));

    expect(mockWriter.write).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("takes over a running scan session before starting", async () => {
    sessionManager.setIsScanning(true);
    const { result } = renderWrite();

    act(() => void result.current.start("**launch.system:snes"));

    await waitFor(() => expect(mockWriter.write).toHaveBeenCalled());
    expect(cancelSession).toHaveBeenCalledOnce();
  });

  it("cancels the work it owns when its context is dismissed", async () => {
    const { result, rerender } = renderWrite();
    act(() => void result.current.start("**launch.system:snes"));
    await waitFor(() => expect(mockWriter.write).toHaveBeenCalled());

    rerender({ contextKey: "media-a", enabled: false });

    await waitFor(() => expect(mockWriter.end).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });

  it("returns to idle when the operation settles", async () => {
    let settle: () => void = () => {};
    mockWriter.write.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const { result } = renderWrite();
    act(() => void result.current.start("**launch.system:snes"));
    await waitFor(() => expect(result.current.state).toBe("waiting"));

    await act(async () => {
      settle();
    });

    expect(result.current.state).toBe("idle");
    expect(mockWriter.end).not.toHaveBeenCalled();
  });
});

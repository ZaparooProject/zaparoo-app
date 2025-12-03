import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { Method } from "../../lib/models";

const mockSend = vi.fn();

// Mock WebSocket manager to simulate connected state
const mockWsManager = {
  isConnected: true,
  currentState: "connected",
  send: mockSend,
};

describe("CoreAPI - launchersRefresh method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
    CoreAPI.setWsInstance(mockWsManager as any);
  });

  it("should have LaunchersRefresh enum value", () => {
    // Test that Method.LaunchersRefresh exists and equals "launchers.refresh"
    expect(Method.LaunchersRefresh).toBe("launchers.refresh");
  });

  it("should call launchersRefresh method with correct JSON-RPC format", () => {
    // This test should fail until we implement launchersRefresh
    expect((CoreAPI as any).launchersRefresh).toBeDefined();

    // Start a launchersRefresh call (but don't await to avoid timeout)
    (CoreAPI as any).launchersRefresh().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe(Method.LaunchersRefresh);
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });

  it("should handle errors in launchersRefresh method", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock CoreAPI.call to reject
    const originalCall = CoreAPI.call;
    CoreAPI.call = vi.fn().mockRejectedValue(new Error("Test error"));

    expect((CoreAPI as any).launchersRefresh).toBeDefined();

    await expect((CoreAPI as any).launchersRefresh()).rejects.toThrow(
      "Test error",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Launchers refresh API call failed:",
      expect.any(Error),
    );

    // Restore
    CoreAPI.call = originalCall;
    consoleSpy.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { Method } from "../../lib/models";

const mockSend = vi.fn();

describe("CoreAPI - launchersRefresh method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
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

    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe(Method.LaunchersRefresh);
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });
});
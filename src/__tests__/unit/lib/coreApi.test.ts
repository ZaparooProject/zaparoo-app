import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "../../../lib/coreApi";

describe("CoreAPI", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    CoreAPI.setSend(mockSend);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize with default send function", () => {
    expect(CoreAPI).toBeDefined();
  });

  it("should send JSON-RPC requests with correct format", async () => {
    // Start a version call (but don't await to avoid timeout)
    CoreAPI.version();
    
    // Process any pending timers
    await vi.runAllTimersAsync();
    
    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();
    
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("version");
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });

  it("should timeout requests after 30 seconds", async () => {
    const promise = CoreAPI.version();
    
    // Advance time by 30 seconds
    vi.advanceTimersByTime(30000);
    
    await expect(promise).rejects.toThrow("Request timeout");
  });
});
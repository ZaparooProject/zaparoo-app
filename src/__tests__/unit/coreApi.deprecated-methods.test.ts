import { describe, it, expect, vi, beforeEach } from "vitest";
import { Method } from "../../lib/models";
import { CoreAPI } from "../../lib/coreApi";

const mockSend = vi.fn();

describe("CoreAPI - Deprecated Methods Removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  it("should NOT have deprecated MediaIndex method", () => {
    // MediaIndex was deprecated, should use MediaGenerate instead
    expect((Method as any).MediaIndex).toBeUndefined();
  });

  it("should NOT have deprecated Launch method", () => {
    // Launch was deprecated, should use Run instead
    expect((Method as any).Launch).toBeUndefined();
  });

  it("should NOT have deprecated mediaIndex method on CoreAPI", () => {
    // The deprecated mediaIndex method should be removed
    expect((CoreAPI as any).mediaIndex).toBeUndefined();
  });

  it("should NOT have deprecated launch method on CoreAPI", () => {
    // The deprecated launch method should be removed
    expect((CoreAPI as any).launch).toBeUndefined();
  });

  it("should have MediaGenerate method as replacement for MediaIndex", () => {
    // MediaGenerate is the replacement for the deprecated MediaIndex
    expect(Method.MediaGenerate).toBe("media.generate");
    expect((CoreAPI as any).mediaGenerate).toBeDefined();
    expect(typeof (CoreAPI as any).mediaGenerate).toBe("function");
  });

  it("should have Run method as replacement for Launch", () => {
    // Run is the replacement for the deprecated Launch
    expect(Method.Run).toBe("run");
    expect((CoreAPI as any).run).toBeDefined();
    expect(typeof (CoreAPI as any).run).toBe("function");
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "@/lib/coreApi.ts";

describe("CoreAPI Missing Methods", () => {
  let mockSend: any;

  let mockWsManager: any;

  beforeEach(() => {
    mockSend = vi.fn();
    // Mock WebSocket manager to simulate connected state
    mockWsManager = {
      isConnected: true,
      currentState: "connected",
      send: mockSend,
    };
    CoreAPI.setSend(mockSend);
    CoreAPI.setWsInstance(mockWsManager);
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it("should call media.generate with correct JSON-RPC format", () => {
    CoreAPI.mediaGenerate().catch(() => {});

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("media.generate");
    expect(sentData.id).toBeDefined();
  });

  it("should call media.generate with systems filter", () => {
    const systems = ["SNES", "Genesis"];
    CoreAPI.mediaGenerate({ systems }).catch(() => {});

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.params).toEqual({ systems });
  });

  it("should call mappings.reload with correct JSON-RPC format", () => {
    CoreAPI.mappingsReload().catch(() => {});

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("mappings.reload");
    expect(sentData.id).toBeDefined();
  });

  it("should call readers with correct JSON-RPC format", () => {
    CoreAPI.readers().catch(() => {});

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("readers");
    expect(sentData.id).toBeDefined();
  });
});

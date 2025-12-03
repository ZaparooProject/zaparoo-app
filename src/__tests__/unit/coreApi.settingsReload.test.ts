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

describe("CoreAPI - settingsReload method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
    CoreAPI.setWsInstance(mockWsManager as any);
  });

  it("should have SettingsReload enum value", () => {
    // Test that Method.SettingsReload exists and equals "settings.reload"
    expect(Method.SettingsReload).toBe("settings.reload");
  });

  it("should call settingsReload using Method enum instead of string literal", () => {
    // Start a settingsReload call (but don't await to avoid timeout)
    CoreAPI.settingsReload().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent using the enum
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe(Method.SettingsReload);
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });
});

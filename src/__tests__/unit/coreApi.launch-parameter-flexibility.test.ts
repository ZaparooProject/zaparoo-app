import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { LaunchRequest } from "../../lib/models";

const mockSend = vi.fn();

// Mock WebSocket manager to simulate connected state
const mockWsManager = {
  isConnected: true,
  currentState: "connected",
  send: mockSend
};

describe("CoreAPI - Launch Parameter Flexibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
    // Set up the WebSocket manager to simulate connection
    CoreAPI.setWsInstance(mockWsManager as any);
  });

  it("should allow launching with only text parameter", () => {
    // According to zaparoo-core API docs, this should be valid:
    // "A request's parameters must contain at least a populated `uid`, `text` or `data` value."
    const textOnlyRequest: LaunchRequest = {
      text: "**launch.system:snes"
    };

    // This should not cause type errors - text only should be sufficient
    CoreAPI.run(textOnlyRequest).catch(() => {
      // Ignore timeout errors
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.params).toEqual({
      text: "**launch.system:snes"
    });
  });

  it("should allow launching with type parameter from zaparoo-core API", () => {
    // According to zaparoo-core API docs, 'type' is an optional parameter
    const requestWithType: LaunchRequest = {
      type: "nfc",
      text: "**launch.system:snes"
    };

    CoreAPI.run(requestWithType).catch(() => {
      // Ignore timeout errors
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.params).toEqual({
      type: "nfc",
      text: "**launch.system:snes"
    });
  });
});
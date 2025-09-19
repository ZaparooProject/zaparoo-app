import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { Method } from "../../lib/models";

const mockSend = vi.fn();

describe("CoreAPI - settingsLogsDownload method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
  });

  it("should have SettingsLogsDownload enum value", () => {
    // Test that Method.SettingsLogsDownload exists and equals "settings.logs.download"
    expect(Method.SettingsLogsDownload).toBe("settings.logs.download");
  });

  it("should call settingsLogsDownload method with correct JSON-RPC format", () => {
    // This test should fail until we implement settingsLogsDownload
    expect((CoreAPI as any).settingsLogsDownload).toBeDefined();

    // Start a settingsLogsDownload call (but don't await to avoid timeout)
    (CoreAPI as any).settingsLogsDownload().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe(Method.SettingsLogsDownload);
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });
});
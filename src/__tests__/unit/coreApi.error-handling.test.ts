import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "@/lib/coreApi";

describe("CoreAPI Error Handling Coverage", () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockClear();
    CoreAPI.setSend(mockSend);
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  afterEach(() => {
    CoreAPI.reset();
  });

  // Define all error test cases: [methodName, errorPrefix, apiCallFn]
  const errorTestCases: [string, string, () => Promise<unknown>][] = [
    [
      "mediaActiveUpdate",
      "Media active update API call failed:",
      () =>
        CoreAPI.mediaActiveUpdate({
          systemId: "test-system",
          mediaPath: "/test/path",
          mediaName: "Test Media",
        }),
    ],
    [
      "settingsReload",
      "Settings reload API call failed:",
      () => CoreAPI.settingsReload(),
    ],
    ["run", "Run API call failed:", () => CoreAPI.run({ text: "test" })],
    ["history", "History API call failed:", () => CoreAPI.history()],
    [
      "mediaSearch",
      "Media search API call failed:",
      () => CoreAPI.mediaSearch({ query: "test", systems: ["snes"] }),
    ],
    [
      "mediaGenerate",
      "Media generate API call failed:",
      () => CoreAPI.mediaGenerate(),
    ],
    ["systems", "Systems API call failed:", () => CoreAPI.systems()],
    ["settings", "Settings API call failed:", () => CoreAPI.settings()],
    [
      "settingsUpdate",
      "Settings update API call failed:",
      () => CoreAPI.settingsUpdate({ debugLogging: true }),
    ],
    ["mappings", "Mappings API call failed:", () => CoreAPI.mappings()],
    [
      "newMapping",
      "New mapping API call failed:",
      () =>
        CoreAPI.newMapping({
          label: "test",
          enabled: true,
          type: "text",
          match: "test",
          pattern: "test",
          override: "test",
        }),
    ],
    [
      "updateMapping",
      "Update mapping API call failed:",
      () => CoreAPI.updateMapping({ id: 1, label: "test" }),
    ],
    [
      "deleteMapping",
      "Delete mapping API call failed:",
      () => CoreAPI.deleteMapping({ id: 1 }),
    ],
    [
      "mappingsReload",
      "Mappings reload API call failed:",
      () => CoreAPI.mappingsReload(),
    ],
    ["media", "Media API call failed:", () => CoreAPI.media()],
    ["tokens", "Tokens API call failed:", () => CoreAPI.tokens()],
    ["stop", "Stop API call failed:", () => CoreAPI.stop()],
    [
      "mediaActive",
      "Media active API call failed:",
      () => CoreAPI.mediaActive(),
    ],
    ["readers", "Readers API call failed:", () => CoreAPI.readers()],
    [
      "readersWriteCancel",
      "Readers write cancel API call failed:",
      () => CoreAPI.readersWriteCancel(),
    ],
    [
      "launchersRefresh",
      "Launchers refresh API call failed:",
      () => (CoreAPI as any).launchersRefresh(),
    ],
  ];

  describe.each(errorTestCases)(
    "%s error handling",
    (_methodName, errorPrefix, apiCallFn) => {
      it("should handle API call failures and reject with error", async () => {
        const errorMessage = errorPrefix.replace(":", "").trim();
        const mockError = new Error(errorMessage);
        mockSend.mockImplementationOnce(() => {
          throw mockError;
        });

        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        await expect(apiCallFn()).rejects.toThrow(errorMessage);

        expect(consoleSpy).toHaveBeenCalledWith(errorPrefix, expect.any(Error));

        consoleSpy.mockRestore();
      });
    },
  );
});

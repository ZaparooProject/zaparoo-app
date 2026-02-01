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

  // Define all error test cases: [methodName, apiCallFn]
  const errorTestCases: [string, () => Promise<unknown>][] = [
    [
      "mediaActiveUpdate",
      () =>
        CoreAPI.mediaActiveUpdate({
          systemId: "test-system",
          mediaPath: "/test/path",
          mediaName: "Test Media",
        }),
    ],
    ["settingsReload", () => CoreAPI.settingsReload()],
    ["run", () => CoreAPI.run({ text: "test" })],
    ["history", () => CoreAPI.history()],
    [
      "mediaSearch",
      () => CoreAPI.mediaSearch({ query: "test", systems: ["snes"] }),
    ],
    ["mediaGenerate", () => CoreAPI.mediaGenerate()],
    ["systems", () => CoreAPI.systems()],
    ["settings", () => CoreAPI.settings()],
    ["settingsUpdate", () => CoreAPI.settingsUpdate({ debugLogging: true })],
    ["mappings", () => CoreAPI.mappings()],
    [
      "newMapping",
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
    ["updateMapping", () => CoreAPI.updateMapping({ id: 1, label: "test" })],
    ["deleteMapping", () => CoreAPI.deleteMapping({ id: 1 })],
    ["mappingsReload", () => CoreAPI.mappingsReload()],
    ["media", () => CoreAPI.media()],
    ["tokens", () => CoreAPI.tokens()],
    ["stop", () => CoreAPI.stop()],
    ["mediaActive", () => CoreAPI.mediaActive()],
    ["readers", () => CoreAPI.readers()],
    ["readersWriteCancel", () => CoreAPI.readersWriteCancel()],
  ];

  describe.each(errorTestCases)(
    "%s error handling",
    (_methodName, apiCallFn) => {
      it("should reject when send fails", async () => {
        mockSend.mockImplementationOnce(() => {
          throw new Error("Send failed");
        });

        await expect(apiCallFn()).rejects.toThrow();
      });
    },
  );
});

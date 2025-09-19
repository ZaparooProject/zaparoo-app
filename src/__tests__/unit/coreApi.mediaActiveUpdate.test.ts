import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { Method } from "../../lib/models";

const mockSend = vi.fn();

describe("CoreAPI - mediaActiveUpdate method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
  });

  it("should call mediaActiveUpdate method with correct parameters", async () => {
    const params = {
      systemId: "test-system",
      mediaPath: "/path/to/media",
      mediaName: "Test Media"
    };

    // This test should fail until we implement mediaActiveUpdate
    expect((CoreAPI as any).mediaActiveUpdate).toBeDefined();

    const promise = (CoreAPI as any).mediaActiveUpdate(params);
    expect(promise).toBeInstanceOf(Promise);

    // Should call send with correct method
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('"method":"media.active.update"')
    );
  });

  it("should have MediaActiveUpdate enum value", () => {
    // This test will fail until we add the enum value
    expect(Method.MediaActiveUpdate).toBe("media.active.update");
  });
});
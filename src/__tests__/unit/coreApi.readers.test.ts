import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";

const mockSend = vi.fn();

describe("CoreAPI - readers method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
  });

  it("should call readers method and return reader info", async () => {
    // This test should fail until we implement readers method
    expect((CoreAPI as any).readers).toBeDefined();

    const promise = (CoreAPI as any).readers();
    expect(promise).toBeInstanceOf(Promise);

    // Should call send with correct method
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('"method":"readers"')
    );
  });
});
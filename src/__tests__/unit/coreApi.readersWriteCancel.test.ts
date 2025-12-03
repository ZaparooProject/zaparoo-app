import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { Method } from "../../lib/models";

const mockSend = vi.fn();

describe("CoreAPI - readersWriteCancel method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
  });

  it("should have ReadersWriteCancel enum value", () => {
    // Test that Method.ReadersWriteCancel exists and equals "readers.write.cancel"
    expect(Method.ReadersWriteCancel).toBe("readers.write.cancel");
  });
});

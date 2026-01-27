import { vi } from "vitest";

export const Clipboard = {
  write: vi.fn().mockResolvedValue(undefined),
  read: vi.fn().mockResolvedValue({ type: "text/plain", value: "" }),
};

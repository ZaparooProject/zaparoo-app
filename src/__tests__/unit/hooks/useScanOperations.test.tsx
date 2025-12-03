import { describe, it, expect, vi } from "vitest";
import { useScanOperations } from "../../../hooks/useScanOperations";

// Mock all dependencies
vi.mock("../../../lib/nfc");
vi.mock("../../../lib/coreApi");
vi.mock("../../../lib/writeNfcHook");
vi.mock("@capacitor-mlkit/barcode-scanning");
vi.mock("react-hot-toast");
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("useScanOperations", () => {
  it("should be importable without errors", () => {
    expect(typeof useScanOperations).toBe("function");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import { ToolsTab } from "@/components/nfc/ToolsTab";

// Mock Capacitor for iOS platform
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "ios"),
  },
}));

describe("ToolsTab on iOS", () => {
  const mockOnToolAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("platform-specific filtering", () => {
    it("should hide Format tool on iOS platform", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      // The "Format" tool should not be visible on iOS (it's Android-only)
      // Using translation keys since global mock returns keys as-is
      expect(screen.queryByText("create.nfc.format")).not.toBeInTheDocument();

      // The other tools should be visible (they support both platforms)
      expect(screen.getAllByText("create.nfc.erase")).toHaveLength(2); // heading + button
      expect(screen.getAllByText("create.nfc.makeReadOnly")).toHaveLength(2); // heading + button
    });
  });
});

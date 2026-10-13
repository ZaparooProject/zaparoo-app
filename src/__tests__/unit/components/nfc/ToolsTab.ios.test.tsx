import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../../../test-utils";
import { ToolsTab } from "@/components/nfc/ToolsTab";

// Mock Capacitor for iOS platform
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "ios"),
  },
}));

describe("ToolsTab on iOS", () => {
  it("should hide Format tool on iOS platform", () => {
    render(
      <ToolsTab
        renderToolControl={({ label }) => (
          <button type="button">{label}</button>
        )}
      />,
    );

    // Format is Android-only.
    expect(
      screen.queryByRole("heading", { name: "create.nfc.format" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "create.nfc.format" }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "create.nfc.erase" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "create.nfc.makeReadOnly" }),
    ).toBeInTheDocument();
  });
});

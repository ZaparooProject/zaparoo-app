import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { Capacitor } from "@capacitor/core";
import { render, screen } from "../../../../test-utils";
import { ToolsTab } from "@/components/nfc/ToolsTab";
import { WriteAction } from "@/lib/writeNfcHook";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "android"),
  },
}));

describe("ToolsTab", () => {
  const onStart = vi.fn();
  const renderTab = (activeAction: WriteAction | null = null) =>
    render(
      <ToolsTab
        renderToolControl={({ action, label }) => (
          <button
            type="button"
            disabled={activeAction !== null && activeAction !== action}
            onClick={() => onStart(action)}
          >
            {label}
          </button>
        )}
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
  });

  it("renders a heading, description and warning for every tool", () => {
    renderTab();

    for (const tool of ["format", "erase", "makeReadOnly"]) {
      expect(
        screen.getByRole("heading", { name: `create.nfc.${tool}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`create.nfc.tools.${tool}Description`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`create.nfc.tools.${tool}Warning`),
      ).toBeInTheDocument();
    }
  });

  it("hands each tool's action and label to the page's reader control", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "create.nfc.format" }));
    await user.click(screen.getByRole("button", { name: "create.nfc.erase" }));
    await user.click(
      screen.getByRole("button", { name: "create.nfc.makeReadOnly" }),
    );

    expect(onStart.mock.calls).toEqual([
      [WriteAction.Format],
      [WriteAction.Erase],
      [WriteAction.MakeReadOnly],
    ]);
  });

  it("keeps every panel and warning mounted while one tool is active", () => {
    renderTab(WriteAction.Erase);

    expect(
      screen.getByRole("button", { name: "create.nfc.erase" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "create.nfc.format" }),
    ).toBeDisabled();
    expect(
      screen.getByText("create.nfc.tools.formatWarning"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("create.nfc.tools.makeReadOnlyWarning"),
    ).toBeInTheDocument();
  });

  it("offers no tools on a platform without tag tools", () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
    renderTab();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

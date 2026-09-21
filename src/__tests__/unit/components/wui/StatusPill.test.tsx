import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { StatusPill } from "@/components/wui/StatusPill";

function renderPill(overrides: Partial<Parameters<typeof StatusPill>[0]> = {}) {
  const onClick = vi.fn();
  render(
    <StatusPill
      dot={<span />}
      label="mister"
      aria-label="scan.devicePill"
      onClick={onClick}
      {...overrides}
    />,
  );
  return { onClick };
}

describe("StatusPill", () => {
  it("announces the sheet it opens", () => {
    renderPill({ "aria-haspopup": "dialog", "aria-expanded": false });

    const pill = screen.getByRole("button", { name: "scan.devicePill" });
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");
    expect(pill).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps its accessible name independent of the visible label", () => {
    renderPill({ label: "a-very-long-device-name-that-truncates" });

    const pill = screen.getByRole("button", { name: "scan.devicePill" });
    expect(pill).toHaveTextContent("a-very-long-device-name-that-truncates");
  });

  it("opens on press", async () => {
    const user = userEvent.setup();
    const { onClick } = renderPill();

    await user.click(screen.getByRole("button", { name: "scan.devicePill" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const { onClick } = renderPill({ disabled: true });

    await user.click(screen.getByRole("button", { name: "scan.devicePill" }));

    expect(onClick).not.toHaveBeenCalled();
  });
});

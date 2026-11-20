import { describe, it, expect, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../../../test-utils";
import { ProScreenPreviewControls } from "@/components/ProScreenPreviewControls";
import { resetProGuideState, useProGuideStore } from "@/lib/proGuideStore";
import { useStatusStore } from "@/lib/store";

describe("ProScreenPreviewControls", () => {
  beforeEach(() => {
    resetProGuideState();
    useStatusStore.getState().setProPurchaseModalOpen(false);
  });

  it("opens the Pro screen as the chosen entry point shows it", async () => {
    const user = userEvent.setup();
    render(<ProScreenPreviewControls />);

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "settings.advanced.proPreviewSource",
      }),
      "shake",
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.advanced.proPreviewShowScreen",
      }),
    );

    expect(useStatusStore.getState().proPurchaseModalOpen).toBe(true);
    expect(useStatusStore.getState().proPurchaseSource).toBe("shake");
  });

  it("opens the Pro guide", async () => {
    const user = userEvent.setup();
    render(<ProScreenPreviewControls />);

    await user.click(
      screen.getByRole("button", {
        name: "settings.advanced.proPreviewShowGuide",
      }),
    );

    expect(useProGuideStore.getState().open).toBe(true);
  });
});

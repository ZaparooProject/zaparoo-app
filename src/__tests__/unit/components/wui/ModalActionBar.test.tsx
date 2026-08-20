import { describe, expect, it } from "vitest";
import { render, screen } from "@/test-utils";
import { ModalActionBar } from "@/components/wui/ModalActionBar";

describe("ModalActionBar", () => {
  it("should preserve renderable falsy secondary content", () => {
    render(
      <ModalActionBar
        secondaryAction={0}
        primaryAction={<button type="button">Continue</button>}
      />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
  });
});

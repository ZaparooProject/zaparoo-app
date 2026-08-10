import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/test-utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";

vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: vi.fn(),
}));

function DialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Test dialog</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("enables Android Back handling only while open", () => {
    render(<DialogHarness />);

    expect(useBackButtonHandler).toHaveBeenLastCalledWith(
      "dialog-content",
      expect.any(Function),
      100,
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(useBackButtonHandler).toHaveBeenLastCalledWith(
      "dialog-content",
      expect.any(Function),
      100,
      true,
    );
  });

  it("closes the open dialog through its Android Back handler", () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const calls = vi.mocked(useBackButtonHandler).mock.calls;
    const handler = calls.at(-1)?.[1];
    act(() => {
      expect(handler?.()).toBe(true);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses localized close text", () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(
      screen.getByRole("button", { name: "nav.close" }),
    ).toBeInTheDocument();
  });
});

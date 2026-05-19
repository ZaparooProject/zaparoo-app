import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../../../test-utils";
import { InboxButton } from "@/components/InboxButton";
import { useStatusStore } from "@/lib/store";
import { InboxSeverity } from "@/lib/models";

const mockImpact = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
  }),
}));

describe("InboxButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState({
      inboxMessages: [],
      inboxModalOpen: false,
    });
  });

  it("should render the default accessible label when there are no messages", () => {
    render(<InboxButton />);

    const button = screen.getByRole("button", { name: /inbox\.openLabel/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveClass("attention-throb");
  });

  it("should render unread count label and attention state when messages exist", () => {
    useStatusStore.setState({
      inboxMessages: [
        {
          id: 1,
          title: "First",
          severity: InboxSeverity.Info,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
        {
          id: 2,
          title: "Second",
          severity: InboxSeverity.Warning,
          createdAt: "2026-05-19T10:01:00.000Z",
        },
      ],
    });

    render(<InboxButton />);

    const button = screen.getByRole("button", {
      name: /inbox\.openLabelWithCount/i,
    });
    expect(button).toHaveClass("attention-throb");
  });

  it("should open inbox and trigger light haptics when clicked", async () => {
    const user = userEvent.setup();
    render(<InboxButton />);

    await user.click(screen.getByRole("button", { name: /inbox\.openLabel/i }));

    expect(mockImpact).toHaveBeenCalledWith("light");
    expect(useStatusStore.getState().inboxModalOpen).toBe(true);
  });
});

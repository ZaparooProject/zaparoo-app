import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "../../test-utils";
import { InboxModal } from "@/components/InboxModal";
import { useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { InboxSeverity } from "@/lib/models";
import { mockInboxMessage } from "../../test-utils/factories";

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    reset: vi.fn(),
    inboxDelete: vi.fn().mockResolvedValue(null),
    inboxClear: vi.fn().mockResolvedValue(null),
  },
}));

describe("InboxModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.reset();
    useStatusStore.setState({
      inboxMessages: [],
      inboxModalOpen: false,
    });
  });

  it("should show empty state when there are no messages", () => {
    useStatusStore.setState({ inboxModalOpen: true, inboxMessages: [] });
    render(<InboxModal />);
    expect(screen.getAllByText("inbox.empty").length).toBeGreaterThan(0);
  });

  it("should render messages with title and timestamp", () => {
    const message = mockInboxMessage({
      id: 1,
      title: "Update available",
      body: "Version 2.9.0 is ready to install.",
      severity: InboxSeverity.Info,
    });
    useStatusStore.setState({
      inboxModalOpen: true,
      inboxMessages: [message],
    });
    render(<InboxModal />);
    expect(screen.getByText("Update available")).toBeInTheDocument();
    expect(
      screen.getByText(new Date(message.createdAt).toLocaleString()),
    ).toBeInTheDocument();
  });

  it("should expand a message body when the row is tapped", async () => {
    const user = userEvent.setup();
    const message = mockInboxMessage({
      id: 1,
      title: "Long alert",
      body: "Detailed body text",
    });
    useStatusStore.setState({
      inboxModalOpen: true,
      inboxMessages: [message],
    });
    render(<InboxModal />);
    const toggle = screen.getByRole("button", { name: /Long alert/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("should call inboxDelete and remove the message when trash is clicked", async () => {
    const user = userEvent.setup();
    const message = mockInboxMessage({ id: 42, title: "Doomed" });
    useStatusStore.setState({
      inboxModalOpen: true,
      inboxMessages: [message],
    });
    render(<InboxModal />);

    const deleteButtons = screen.getAllByRole("button", {
      name: /inbox\.deleteOne/i,
    });
    await user.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(CoreAPI.inboxDelete).toHaveBeenCalledWith({ id: 42 });
    });
    await waitFor(() => {
      expect(useStatusStore.getState().inboxMessages).toHaveLength(0);
    });
  });

  it("should keep the message when delete fails", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.inboxDelete).mockRejectedValueOnce(
      new Error("Delete failed"),
    );
    const message = mockInboxMessage({ id: 43, title: "Still here" });
    useStatusStore.setState({
      inboxModalOpen: true,
      inboxMessages: [message],
    });
    render(<InboxModal />);

    const deleteButtons = screen.getAllByRole("button", {
      name: /inbox\.deleteOne/i,
    });
    await user.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(CoreAPI.inboxDelete).toHaveBeenCalledWith({ id: 43 });
    });
    expect(useStatusStore.getState().inboxMessages).toEqual([message]);
  });

  it("should show confirm step before clearing all", async () => {
    const user = userEvent.setup();
    useStatusStore.setState({
      inboxModalOpen: true,
      inboxMessages: [mockInboxMessage({ id: 1 }), mockInboxMessage({ id: 2 })],
    });
    render(<InboxModal />);

    const clearAll = screen.getAllByRole("button", {
      name: /inbox\.clearAll/i,
    });
    await user.click(clearAll[0]!);

    expect(screen.getAllByText("inbox.confirmClear").length).toBeGreaterThan(0);
    expect(CoreAPI.inboxClear).not.toHaveBeenCalled();

    const confirmYes = screen.getAllByRole("button", {
      name: /inbox\.confirmClearYes/i,
    });
    await user.click(confirmYes[0]!);

    await waitFor(() => {
      expect(CoreAPI.inboxClear).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(useStatusStore.getState().inboxMessages).toEqual([]);
    });
  });

  it("should keep messages when clear all fails", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.inboxClear).mockRejectedValueOnce(
      new Error("Clear failed"),
    );
    const messages = [mockInboxMessage({ id: 1 }), mockInboxMessage({ id: 2 })];
    useStatusStore.setState({
      inboxModalOpen: true,
      inboxMessages: messages,
    });
    render(<InboxModal />);

    await user.click(
      screen.getAllByRole("button", { name: /inbox\.clearAll/i })[0]!,
    );
    await user.click(
      screen.getAllByRole("button", { name: /inbox\.confirmClearYes/i })[0]!,
    );

    await waitFor(() => {
      expect(CoreAPI.inboxClear).toHaveBeenCalled();
    });
    expect(useStatusStore.getState().inboxMessages).toEqual(messages);
    expect(screen.getAllByText("inbox.confirmClear").length).toBeGreaterThan(0);
  });

  it("should cancel the clear-all confirm", async () => {
    const user = userEvent.setup();
    useStatusStore.setState({
      inboxModalOpen: true,
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });
    render(<InboxModal />);

    await user.click(
      screen.getAllByRole("button", { name: /inbox\.clearAll/i })[0]!,
    );
    await user.click(
      screen.getAllByRole("button", { name: /inbox\.confirmClearNo/i })[0]!,
    );

    expect(CoreAPI.inboxClear).not.toHaveBeenCalled();
    expect(useStatusStore.getState().inboxMessages).toHaveLength(1);
  });
});

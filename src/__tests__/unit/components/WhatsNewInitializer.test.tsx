import { act, render, screen, waitFor } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsNewInitializer } from "@/components/WhatsNewInitializer";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  buildRuntimeReleaseIdentity,
  buildWhatsNewAnnouncement,
} from "@/test-utils/factories";

const whatsNewMock = vi.hoisted(() => ({
  resolveRuntimeReleaseIdentity: vi.fn(),
  getWhatsNewAnnouncement: vi.fn(),
}));

vi.mock("@/lib/whatsNew", () => ({
  resolveRuntimeReleaseIdentity: whatsNewMock.resolveRuntimeReleaseIdentity,
  getWhatsNewAnnouncement: whatsNewMock.getWhatsNewAnnouncement,
}));

const identity = buildRuntimeReleaseIdentity();
const announcement = buildWhatsNewAnnouncement({
  releaseKeys: [identity.releaseKey],
});

function setPreferencesState(
  values: Partial<ReturnType<typeof usePreferencesStore.getState>>,
) {
  usePreferencesStore.setState({
    ...usePreferencesStore.getState(),
    _hasHydrated: true,
    tourCompleted: true,
    whatsNewInitialized: true,
    lastWhatsNewRuntimeKey: "native:1.0.0+1",
    seenWhatsNewAnnouncementIds: [],
    ...values,
  });
}

describe("WhatsNewInitializer", () => {
  beforeEach(() => {
    vi.useRealTimers();
    whatsNewMock.resolveRuntimeReleaseIdentity.mockResolvedValue(identity);
    whatsNewMock.getWhatsNewAnnouncement.mockReturnValue(announcement);
    setPreferencesState({});
  });

  it("should seed fresh installs without showing the dialog", async () => {
    setPreferencesState({ whatsNewInitialized: false, tourCompleted: false });

    render(<WhatsNewInitializer />);

    await waitFor(() => {
      expect(usePreferencesStore.getState().whatsNewInitialized).toBe(true);
    });

    expect(usePreferencesStore.getState().lastWhatsNewRuntimeKey).toBe(
      identity.releaseKey,
    );
    expect(
      usePreferencesStore.getState().seenWhatsNewAnnouncementIds,
    ).toContain(announcement.id);

    act(() => {
      usePreferencesStore.setState({ tourCompleted: true });
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should treat uninitialized users with completed tours as legacy installs", async () => {
    const user = userEvent.setup();
    setPreferencesState({ whatsNewInitialized: false, tourCompleted: true });

    render(<WhatsNewInitializer />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: "whatsNew.gotIt" }),
    );

    expect(usePreferencesStore.getState().whatsNewInitialized).toBe(true);
    expect(
      usePreferencesStore.getState().seenWhatsNewAnnouncementIds,
    ).toContain(announcement.id);
  });

  it("should show an unseen announcement for existing users", async () => {
    render(<WhatsNewInitializer />);

    await waitFor(() => {
      expect(whatsNewMock.getWhatsNewAnnouncement).toHaveBeenCalledWith(
        identity.releaseKey,
      );
    });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("What's new in test")).toBeInTheDocument();
    expect(screen.getByText("First test item")).toBeInTheDocument();
    expect(screen.getByText("Second test item")).toBeInTheDocument();
  });

  it("should wait for the getting started tour before showing", async () => {
    setPreferencesState({ tourCompleted: false });

    render(<WhatsNewInitializer />);

    await waitFor(() => {
      expect(whatsNewMock.getWhatsNewAnnouncement).toHaveBeenCalled();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => {
      usePreferencesStore.setState({ tourCompleted: true });
    });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("should mark the announcement seen on dismiss", async () => {
    const user = userEvent.setup();

    render(<WhatsNewInitializer />);

    await waitFor(() => {
      expect(whatsNewMock.getWhatsNewAnnouncement).toHaveBeenCalled();
    });

    await user.click(
      await screen.findByRole("button", { name: "whatsNew.gotIt" }),
    );

    expect(
      usePreferencesStore.getState().seenWhatsNewAnnouncementIds,
    ).toContain(announcement.id);
    expect(usePreferencesStore.getState().lastWhatsNewRuntimeKey).toBe(
      identity.releaseKey,
    );
  });

  it("should not repeat seen announcements", async () => {
    setPreferencesState({ seenWhatsNewAnnouncementIds: [announcement.id] });

    render(<WhatsNewInitializer />);

    await waitFor(() => {
      expect(whatsNewMock.getWhatsNewAnnouncement).toHaveBeenCalled();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(usePreferencesStore.getState().lastWhatsNewRuntimeKey).toBe(
      identity.releaseKey,
    );
  });

  it("should ignore releases without announcements", async () => {
    whatsNewMock.getWhatsNewAnnouncement.mockReturnValue(undefined);

    render(<WhatsNewInitializer />);

    await waitFor(() => {
      expect(usePreferencesStore.getState().lastWhatsNewRuntimeKey).toBe(
        identity.releaseKey,
      );
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

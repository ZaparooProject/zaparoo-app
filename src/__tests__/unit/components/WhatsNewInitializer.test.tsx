import { act, fireEvent, render, screen, waitFor } from "@/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsNewInitializer } from "@/components/WhatsNewInitializer";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type {
  RuntimeReleaseIdentity,
  WhatsNewAnnouncement,
} from "@/lib/whatsNew";

const whatsNewMock = vi.hoisted(() => ({
  resolveRuntimeReleaseIdentity: vi.fn(),
  getWhatsNewAnnouncement: vi.fn(),
}));

vi.mock("@/lib/whatsNew", () => ({
  resolveRuntimeReleaseIdentity: whatsNewMock.resolveRuntimeReleaseIdentity,
  getWhatsNewAnnouncement: whatsNewMock.getWhatsNewAnnouncement,
}));

const identity: RuntimeReleaseIdentity = {
  nativeVersion: "1.0.1",
  nativeBuild: "2",
  liveBundleId: null,
  releaseKey: "native:1.0.1+2",
};

const announcement: WhatsNewAnnouncement = {
  id: "release-1.0.1",
  releaseKeys: [identity.releaseKey],
  title: "What's new in test",
  items: ["First test item", "Second test item"],
};

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
    setPreferencesState({ whatsNewInitialized: false, tourCompleted: true });

    render(<WhatsNewInitializer />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.click(
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
    render(<WhatsNewInitializer />);

    await waitFor(() => {
      expect(whatsNewMock.getWhatsNewAnnouncement).toHaveBeenCalled();
    });

    fireEvent.click(
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

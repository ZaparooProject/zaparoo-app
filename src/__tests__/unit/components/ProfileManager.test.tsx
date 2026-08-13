import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { ProfileManager } from "@/components/ProfileManager";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    profiles: vi.fn(),
    activeProfile: vi.fn(),
    newProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    switchProfile: vi.fn(),
  },
}));

const profile = {
  profileId: "profile-1",
  name: "Kid A",
  role: "member" as const,
  switchId: "corn-arm-truck",
  hasPin: true,
  createdAt: 1,
  lastUpdatedAt: 1,
};

describe("ProfileManager", () => {
  const renderManager = (canManage = true) =>
    render(
      <ProfileManager
        connected
        canManage={canManage}
        canWriteSettings={canManage}
        requireForLaunch={false}
        settingsLoading={false}
        onRequireForLaunchChange={vi.fn()}
        available
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CoreAPI.profiles).mockResolvedValue({ profiles: [profile] });
    vi.mocked(CoreAPI.activeProfile).mockResolvedValue({
      profileId: profile.profileId,
      name: profile.name,
      role: profile.role,
      hasPin: profile.hasPin,
    });
    vi.mocked(CoreAPI.newProfile).mockReset().mockResolvedValue(profile);
    vi.mocked(CoreAPI.updateProfile).mockReset().mockResolvedValue(profile);
    vi.mocked(CoreAPI.deleteProfile).mockReset().mockResolvedValue();
    vi.mocked(CoreAPI.switchProfile).mockReset().mockResolvedValue(null);
    useStatusStore.setState({ writeQueue: "", writeOpen: false });
  });

  it("should list profiles and active state", async () => {
    renderManager();

    expect(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("settings.core.profiles.active").length,
    ).toBeGreaterThan(0);
  });

  it("should create first profile as admin with PIN", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.profiles).mockResolvedValue({ profiles: [] });

    renderManager();
    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.add",
      }),
    );
    await user.type(
      screen.getByLabelText("settings.core.profiles.nameRequiredLabel"),
      "Parent",
    );
    await user.type(
      screen.getByLabelText("settings.core.profiles.pinRequiredLabel"),
      "1234",
    );
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(CoreAPI.newProfile).toHaveBeenCalledWith({
        name: "Parent",
        role: "admin",
        pin: "1234",
      });
    });
  });

  it("should explain why first profile role is fixed", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.profiles).mockResolvedValue({ profiles: [] });

    renderManager();
    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.add",
      }),
    );

    expect(
      screen.getByText("settings.core.profiles.firstAdminHelp"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "settings.core.profiles.role.member",
      }),
    ).toBeDisabled();
  });

  it("should lock role for the only admin profile", async () => {
    const user = userEvent.setup();
    const adminProfile = {
      ...profile,
      name: "Parent",
      role: "admin" as const,
    };
    vi.mocked(CoreAPI.profiles).mockResolvedValue({
      profiles: [adminProfile],
    });

    renderManager();
    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );

    expect(
      screen.getByText("settings.core.profiles.soleAdminHelp"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "settings.core.profiles.role.member",
      }),
    ).toBeDisabled();
  });

  it("should offer explicit PIN actions for an existing member PIN", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );

    expect(
      screen.getByRole("radio", {
        name: "settings.core.profiles.pinKeep",
      }),
    ).toBeChecked();
    expect(
      screen.queryByLabelText("settings.core.profiles.pinOptionalLabel"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", {
        name: "settings.core.profiles.pinChange",
      }),
    );
    expect(
      screen.getByLabelText("settings.core.profiles.pinOptionalLabel"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "settings.core.profiles.pinRemove",
      }),
    ).toBeInTheDocument();
  });

  it("should show structured limits only when enabled", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.profiles).mockResolvedValue({ profiles: [] });

    renderManager();
    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.add",
      }),
    );
    expect(
      screen.queryByRole("group", {
        name: "settings.core.profiles.dailyLimit",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", {
        name: "settings.core.profiles.limitsOn",
      }),
    );

    expect(
      screen.getByRole("group", {
        name: "settings.core.profiles.dailyLimit",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: "settings.core.profiles.sessionLimit",
      }),
    ).toBeInTheDocument();
  });

  it("should remove an existing member PIN when requested", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );
    await user.click(
      screen.getByRole("radio", {
        name: "settings.core.profiles.pinRemove",
      }),
    );
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(CoreAPI.updateProfile).toHaveBeenCalledWith({
        profileId: "profile-1",
        name: "Kid A",
        role: "member",
        clearLimits: true,
        clearPin: true,
      });
    });
  });

  it("should reset existing profile cards after confirmation", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.core.profiles.resetCards",
      }),
    );
    const resetDialog = screen.getByRole("dialog", {
      name: "settings.core.profiles.resetCardsTitle",
    });
    await user.click(
      within(resetDialog).getByRole("button", {
        name: "settings.core.profiles.resetCards",
      }),
    );

    await waitFor(() => {
      expect(CoreAPI.updateProfile).toHaveBeenCalledWith({
        profileId: "profile-1",
        regenerateSwitchId: true,
      });
    });
  });

  it("should show a retry action when profiles fail to load", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.profiles)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ profiles: [profile] });

    renderManager();

    await user.click(await screen.findByRole("button", { name: "retry" }));

    expect(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    ).toBeInTheDocument();
  });

  it("should queue profile switch card contents", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.core.profiles.writeCard",
      }),
    );

    expect(useStatusStore.getState().writeQueue).toBe(
      "**profile:corn-arm-truck",
    );
  });

  it("should update an existing profile with enabled limits", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );
    await user.click(
      screen.getByRole("radio", {
        name: "settings.core.profiles.limitsOn",
      }),
    );
    const dailyGroup = screen.getByRole("group", {
      name: "settings.core.profiles.dailyLimit",
    });
    const sessionGroup = screen.getByRole("group", {
      name: "settings.core.profiles.sessionLimit",
    });
    await user.clear(
      within(dailyGroup).getByLabelText("settings.core.playtime.hours"),
    );
    await user.type(
      within(dailyGroup).getByLabelText("settings.core.playtime.hours"),
      "2",
    );
    await user.clear(
      within(dailyGroup).getByLabelText("settings.core.playtime.minutes"),
    );
    await user.type(
      within(dailyGroup).getByLabelText("settings.core.playtime.minutes"),
      "30",
    );
    await user.clear(
      within(sessionGroup).getByLabelText("settings.core.playtime.hours"),
    );
    await user.type(
      within(sessionGroup).getByLabelText("settings.core.playtime.hours"),
      "1",
    );
    await user.clear(
      within(sessionGroup).getByLabelText("settings.core.playtime.minutes"),
    );
    await user.type(
      within(sessionGroup).getByLabelText("settings.core.playtime.minutes"),
      "15",
    );
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(CoreAPI.updateProfile).toHaveBeenCalledWith({
        profileId: "profile-1",
        name: "Kid A",
        role: "member",
        clearLimits: true,
        limitsEnabled: true,
        dailyLimit: "2h30m",
        sessionLimit: "1h15m",
      });
    });
  });

  it("should delete an existing profile after confirmation", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "settings.core.profiles.delete" }),
    );
    const deleteDialog = screen.getByRole("dialog", {
      name: "settings.core.profiles.deleteTitle",
    });
    await user.click(
      within(deleteDialog).getByRole("button", {
        name: "settings.core.profiles.delete",
      }),
    );

    await waitFor(() => {
      expect(CoreAPI.deleteProfile).toHaveBeenCalledWith("profile-1");
    });
  });

  it("should report a profile save failure without closing the editor", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.updateProfile).mockRejectedValueOnce(
      new Error("save failed"),
    );
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(CoreAPI.updateProfile).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("dialog", { name: "settings.core.profiles.edit" }),
    ).toBeInTheDocument();
  });

  it("should switch to the shared profile without a PIN", async () => {
    const user = userEvent.setup();
    renderManager(false);

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.switch",
      }),
    );
    const switchDialog = screen.getByRole("dialog", {
      name: "settings.core.profiles.switch",
    });
    expect(
      within(switchDialog).getByRole("button", {
        name: "settings.core.profiles.shared",
        pressed: true,
      }),
    ).toBeInTheDocument();
    await user.click(
      within(switchDialog).getByRole("button", {
        name: "settings.core.profiles.switch",
      }),
    );

    await waitFor(() => {
      expect(CoreAPI.switchProfile).toHaveBeenCalledWith();
    });
  });

  it("should require PIN when switching to protected profile", async () => {
    const user = userEvent.setup();
    renderManager(false);

    await user.click(
      await screen.findByRole("button", {
        name: "settings.core.profiles.openProfile",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Kid A settings.core.profiles.active",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Kid A settings.core.profiles.active",
        pressed: true,
      }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("settings.core.profiles.pin"),
      "1234",
    );
    const switchDialog = screen.getByRole("dialog", {
      name: "settings.core.profiles.switch",
    });
    await user.click(
      within(switchDialog).getByRole("button", {
        name: "settings.core.profiles.switch",
      }),
    );

    await waitFor(() => {
      expect(CoreAPI.switchProfile).toHaveBeenCalledWith({
        profileId: "profile-1",
        pin: "1234",
      });
    });
  });
});

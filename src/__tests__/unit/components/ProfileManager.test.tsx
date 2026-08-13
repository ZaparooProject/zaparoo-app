import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test-utils";
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
    vi.mocked(CoreAPI.newProfile).mockResolvedValue(profile);
    vi.mocked(CoreAPI.switchProfile).mockResolvedValue(null);
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
    await user.type(
      screen.getByLabelText("settings.core.profiles.pin"),
      "1234",
    );
    const switchButtons = screen.getAllByRole("button", {
      name: "settings.core.profiles.switch",
    });
    await user.click(switchButtons.at(-1)!);

    await waitFor(() => {
      expect(CoreAPI.switchProfile).toHaveBeenCalledWith({
        profileId: "profile-1",
        pin: "1234",
      });
    });
  });
});

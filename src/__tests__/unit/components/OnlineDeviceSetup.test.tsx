import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { User } from "@capacitor-firebase/authentication";
import toast from "react-hot-toast";
import { render, screen, waitFor, within } from "@/test-utils";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { CoreApiError } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { ClientCapability, type ClientsCurrentResponse } from "@/lib/models";
import { useStatusStore } from "@/lib/store";

const {
  mockUseDeviceLinking,
  mockUseClientCapability,
  mockSettings,
  mockSettingsUpdate,
  mockBackupStatus,
  mockRemoteActivity,
  mockUnlink,
  mockNavigate,
} = vi.hoisted(() => ({
  mockUseDeviceLinking: vi.fn(),
  mockUseClientCapability: vi.fn(),
  mockSettings: vi.fn(),
  mockSettingsUpdate: vi.fn(),
  mockBackupStatus: vi.fn(),
  mockRemoteActivity: vi.fn(),
  mockUnlink: vi.fn(),
  mockNavigate: vi.fn(),
}));

const signedInUser: User = {
  displayName: null,
  email: "user@example.com",
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  phoneNumber: null,
  photoUrl: null,
  providerData: [],
  providerId: "password",
  tenantId: null,
  uid: "user-123",
};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

vi.mock("@/hooks/useDeviceLinking", () => ({
  useDeviceLinking: (enabled: boolean) => mockUseDeviceLinking(enabled),
}));

vi.mock("@/hooks/useClientCapability", () => ({
  useClientCapability: () => mockUseClientCapability(),
}));

vi.mock("@/lib/coreApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/coreApi")>()),
  CoreAPI: {
    settings: () => mockSettings(),
    settingsUpdate: (params: unknown) => mockSettingsUpdate(params),
    settingsBackupStatus: () => mockBackupStatus(),
    remoteActivity: () => mockRemoteActivity(),
    settingsAuthUnlink: () => mockUnlink(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { OnlineDeviceSetup } from "@/components/OnlineDeviceSetup";

function backupStatus(overrides: Record<string, unknown> = {}) {
  return {
    activeOperation: "",
    local: {
      lastStatus: "",
      lastBackupSize: 0,
      enabled: true,
    },
    remote: {
      lastStatus: "",
      lastBackupSize: 0,
      enabled: false,
      linked: true,
      ...overrides,
    },
  };
}

describe("OnlineDeviceSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState({
      loggedInUser: signedInUser,
      coreVersion: "2.16.0",
      currentClient: {
        paired: true,
        role: "admin",
        capabilities: [ClientCapability.SettingsWrite],
      },
    });
    mockUseDeviceLinking.mockReturnValue({
      state: "unlinked",
      linkDevice: vi.fn(),
    });
    mockUseClientCapability.mockReturnValue(true);
    mockSettings.mockResolvedValue({
      playtimeSyncEnabled: false,
      backupRemoteEnabled: false,
      backupRemoteSchedule: "daily",
    });
    mockSettingsUpdate.mockResolvedValue(undefined);
    mockBackupStatus.mockResolvedValue(backupStatus());
    mockRemoteActivity.mockResolvedValue({ status: { state: "waiting" } });
    mockUnlink.mockResolvedValue({ domains: [] });
  });

  it("should put device linking details in help", async () => {
    const user = userEvent.setup();
    render(<OnlineDeviceSetup connected={false} warpActive={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Help for online.deviceLink.title",
      }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("online.deviceLink.help")).toBeInTheDocument();
    expect(mockSettings).not.toHaveBeenCalled();
    expect(mockBackupStatus).not.toHaveBeenCalled();
  });

  it("should explain disconnection and return to Settings", async () => {
    const user = userEvent.setup();
    render(<OnlineDeviceSetup connected={false} warpActive={false} />);

    expect(
      screen.getByText("online.deviceLink.disconnected"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "online.deviceLink.backToSettings",
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
    expect(mockSettings).not.toHaveBeenCalled();
    expect(mockBackupStatus).not.toHaveBeenCalled();
  });

  it("should clear linked features when the Core disconnects", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    const { rerender } = render(
      <OnlineDeviceSetup connected warpActive={false} />,
    );

    expect(
      await screen.findByRole("heading", { name: "online.features.title" }),
    ).toBeInTheDocument();
    expect(mockSettings).toHaveBeenCalledOnce();
    expect(mockBackupStatus).toHaveBeenCalledOnce();

    rerender(<OnlineDeviceSetup connected={false} warpActive={false} />);

    expect(
      screen.getByText("online.deviceLink.disconnected"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "online.features.title" }),
    ).not.toBeInTheDocument();
  });

  it("should offer linking without an inline description", () => {
    render(<OnlineDeviceSetup connected warpActive={false} />);

    expect(
      screen.queryByText("online.deviceLink.description"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "online.deviceLink.link" }),
    ).toBeInTheDocument();
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it("should reserve Online feature layout while link status loads", () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "checking",
      linkDevice: vi.fn(),
    });

    render(<OnlineDeviceSetup connected warpActive={null} />);

    expect(
      screen.getByRole("status", { name: "online.features.loading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("online.features.title")).toBeInTheDocument();
    expect(mockSettings).not.toHaveBeenCalled();
    expect(mockBackupStatus).not.toHaveBeenCalled();
  });

  it("should leave focus alone when the status check finds a linked device", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "checking",
      linkDevice: vi.fn(),
    });
    const { rerender } = render(
      <OnlineDeviceSetup connected warpActive={false} />,
    );

    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    rerender(<OnlineDeviceSetup connected warpActive={false} />);

    const heading = await screen.findByRole("heading", {
      name: "online.features.title",
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(heading).not.toHaveFocus();
  });

  it("should move focus to features when linking completes", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linking",
      linkDevice: vi.fn(),
    });
    const { rerender } = render(
      <OnlineDeviceSetup connected warpActive={false} />,
    );

    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    rerender(<OnlineDeviceSetup connected warpActive={false} />);

    const heading = await screen.findByRole("heading", {
      name: "online.features.title",
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("should show free and Warp feature controls to admin clients", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });

    render(<OnlineDeviceSetup connected warpActive={false} />);

    expect(
      await screen.findByRole("checkbox", {
        name: "online.features.playHistory",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("online.features.free")).toBeInTheDocument();
    expect(
      screen.getByText("online.features.requiresWarp"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "online.features.automaticBackup",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "online.features.schedule" }),
    ).toBeDisabled();
    expect(
      screen.queryByText("online.features.description"),
    ).not.toBeInTheDocument();
  });

  it("should explicitly enable play history sync", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    const user = userEvent.setup();
    render(<OnlineDeviceSetup connected warpActive={false} />);

    await user.click(
      await screen.findByRole("checkbox", {
        name: "online.features.playHistory",
      }),
    );

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      playtimeSyncEnabled: true,
    });
  });

  it("should enable cloud backup controls for Warp accounts", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    const user = userEvent.setup();
    render(<OnlineDeviceSetup connected warpActive />);

    await user.click(
      await screen.findByRole("checkbox", {
        name: "online.features.automaticBackup",
      }),
    );

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      backupRemoteEnabled: true,
    });
  });

  it("should use connected Core Warp availability when account status is blocked", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    mockBackupStatus.mockResolvedValue(
      backupStatus({ availability: "available" }),
    );

    render(<OnlineDeviceSetup connected warpActive={null} />);

    expect(
      await screen.findByRole("checkbox", {
        name: "online.features.automaticBackup",
      }),
    ).toBeEnabled();
    expect(
      screen.queryByText("online.features.checkingWarp"),
    ).not.toBeInTheDocument();
  });

  it("should resolve blocked account checks as Warp required when Core reports unavailable", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    mockBackupStatus.mockResolvedValue(
      backupStatus({ availability: "unavailable" }),
    );

    render(<OnlineDeviceSetup connected warpActive={null} />);

    expect(
      await screen.findByText("online.features.requiresWarp"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("online.features.checkingWarp"),
    ).not.toBeInTheDocument();
  });

  it("should keep checking while both Warp sources are unresolved", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    mockBackupStatus.mockResolvedValue(
      backupStatus({ availability: "unknown" }),
    );

    render(<OnlineDeviceSetup connected warpActive={null} />);

    expect(
      await screen.findByText("online.features.checkingWarp"),
    ).toBeInTheDocument();
  });

  it("should show device-side setup guidance to non-admin clients", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    mockUseClientCapability.mockReturnValue(false);

    render(<OnlineDeviceSetup connected warpActive={false} />);

    expect(
      await screen.findByText("online.features.adminRequired"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("online.features.playHistorySummary"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("online.features.automaticBackupSummary"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it("should reject stale settings capability for a paired member", async () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    useStatusStore.setState({
      currentClient: {
        paired: true,
        role: "member",
        capabilities: [ClientCapability.SettingsWrite],
      },
    });

    render(<OnlineDeviceSetup connected warpActive={false} />);

    expect(
      await screen.findByText("online.features.adminRequired"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(mockSettings).not.toHaveBeenCalled();
  });

  describe("Online settings authority", () => {
    const writableClients: [string, ClientsCurrentResponse][] = [
      [
        "a localhost client on Core 2.17",
        {
          paired: false,
          role: null,
          capabilities: [ClientCapability.SettingsWrite],
          access: "localhost",
        },
      ],
      [
        "a paired member connected locally on Core 2.17",
        {
          paired: true,
          role: "member",
          capabilities: [ClientCapability.SettingsWrite],
          access: "localhost",
        },
      ],
      [
        "an API-key admin on Core 2.17",
        {
          paired: false,
          role: null,
          capabilities: [ClientCapability.SettingsWrite],
          access: "admin",
        },
      ],
      [
        "a paired admin on Core 2.16",
        {
          paired: true,
          role: "admin",
          capabilities: [ClientCapability.SettingsWrite],
        },
      ],
    ];

    it.each(writableClients)(
      "should offer Online settings controls to %s",
      async (_, client) => {
        mockUseDeviceLinking.mockReturnValue({
          state: "linked",
          linkDevice: vi.fn(),
        });
        useStatusStore.setState({ currentClient: client });

        render(<OnlineDeviceSetup connected warpActive={false} />);

        expect(
          await screen.findByRole("checkbox", {
            name: "online.features.playHistory",
          }),
        ).toBeInTheDocument();
        expect(
          screen.queryByText("online.features.adminRequired"),
        ).not.toBeInTheDocument();
        expect(mockSettings).toHaveBeenCalledOnce();
      },
    );

    const readOnlyClients: [string, ClientsCurrentResponse][] = [
      [
        "a legacy client holding settings.write on Core 2.17",
        {
          paired: false,
          role: null,
          capabilities: [ClientCapability.SettingsWrite],
          access: "legacy",
        },
      ],
      [
        "a paired admin downgraded to member access on Core 2.17",
        {
          paired: true,
          role: "admin",
          capabilities: [ClientCapability.SettingsWrite],
          access: "member",
        },
      ],
      [
        "an unpaired remote client holding settings.write on Core 2.16",
        {
          paired: false,
          role: null,
          capabilities: [ClientCapability.SettingsWrite],
        },
      ],
    ];

    it.each(readOnlyClients)(
      "should show the read-only summary to %s",
      async (_, client) => {
        await seedActiveDevice({ address: "192.168.1.100" });
        mockUseDeviceLinking.mockReturnValue({
          state: "linked",
          linkDevice: vi.fn(),
        });
        useStatusStore.setState({ currentClient: client });

        render(<OnlineDeviceSetup connected warpActive={false} />);

        expect(
          await screen.findByText("online.features.adminRequired"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("online.features.playHistorySummary"),
        ).toBeInTheDocument();
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
        expect(mockSettings).not.toHaveBeenCalled();
      },
    );

    it.each(["localhost", "127.0.0.1", "[::1]"])(
      "should offer Online settings controls to an unpaired Core 2.16 client dialled at %s",
      async (address) => {
        await seedActiveDevice({ address });
        mockUseDeviceLinking.mockReturnValue({
          state: "linked",
          linkDevice: vi.fn(),
        });
        useStatusStore.setState({
          currentClient: {
            paired: false,
            role: null,
            capabilities: [ClientCapability.SettingsWrite],
          },
        });

        render(<OnlineDeviceSetup connected warpActive={false} />);

        expect(
          await screen.findByRole("checkbox", {
            name: "online.features.playHistory",
          }),
        ).toBeInTheDocument();
      },
    );

    it("should explain without reporting when Core still rejects the client", async () => {
      mockUseDeviceLinking.mockReturnValue({
        state: "linked",
        linkDevice: vi.fn(),
      });
      mockSettingsUpdate.mockRejectedValue(
        new CoreApiError("online settings require a local or admin client", 1),
      );
      const user = userEvent.setup();
      render(<OnlineDeviceSetup connected warpActive={false} />);

      await user.click(
        await screen.findByRole("checkbox", {
          name: "online.features.playHistory",
        }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "online.features.adminRequired",
        ),
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalledWith(
        "online.features.updateFailed",
      );
    });

    it("should report an unexpected settings update failure", async () => {
      mockUseDeviceLinking.mockReturnValue({
        state: "linked",
        linkDevice: vi.fn(),
      });
      const failure = new CoreApiError("error saving settings", 1);
      mockSettingsUpdate.mockRejectedValue(failure);
      const user = userEvent.setup();
      render(<OnlineDeviceSetup connected warpActive={false} />);

      await user.click(
        await screen.findByRole("checkbox", {
          name: "online.features.playHistory",
        }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "online.features.updateFailed",
        ),
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to update Online device settings",
        failure,
        expect.objectContaining({ severity: "error" }),
      );
    });
  });

  it("should show the last successful cloud backup date", async () => {
    const formatDate = vi
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockReturnValue("Jan 1, 2030");
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    mockBackupStatus.mockResolvedValue(
      backupStatus({
        lastStatus: "success",
        lastSuccessAt: "2030-01-01T00:00:00Z",
      }),
    );

    render(<OnlineDeviceSetup connected warpActive />);

    expect(
      await screen.findByText("online.features.lastBackup"),
    ).toBeInTheDocument();
    expect(formatDate).toHaveBeenCalledWith("en", { dateStyle: "medium" });
    formatDate.mockRestore();
  });

  describe("on Core 2.18", () => {
    beforeEach(() => {
      useStatusStore.setState({ connected: true, coreVersion: "2.18.0" });
      mockUseDeviceLinking.mockReturnValue({
        state: "linked",
        linkDevice: vi.fn(),
      });
      mockSettings.mockResolvedValue({
        playtimeSyncEnabled: true,
        librarySyncEnabled: false,
        remoteControlEnabled: false,
        backupRemoteEnabled: false,
        backupRemoteSchedule: "daily",
      });
    });

    it("should turn library sync and remote control on individually", async () => {
      const user = userEvent.setup();
      render(<OnlineDeviceSetup connected warpActive={null} />);

      await user.click(
        await screen.findByRole("checkbox", {
          name: "online.features.librarySync",
        }),
      );
      await waitFor(() =>
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          librarySyncEnabled: true,
        }),
      );
      await user.click(
        screen.getByRole("checkbox", { name: "online.features.remoteControl" }),
      );
      await waitFor(() =>
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          remoteControlEnabled: true,
        }),
      );
    });

    it("should turn every feature on, leaving cloud backup alone without Warp", async () => {
      const user = userEvent.setup();
      mockBackupStatus.mockResolvedValue(
        backupStatus({ availability: "unavailable" }),
      );
      render(<OnlineDeviceSetup connected warpActive={null} />);

      const all = await screen.findByRole("checkbox", {
        name: "online.features.allFeatures",
      });
      expect(all).not.toBeChecked();
      expect(screen.getByText("online.features.someOn")).toBeInTheDocument();
      await user.click(all);

      await waitFor(() =>
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          playtimeSyncEnabled: true,
          remoteControlEnabled: true,
          librarySyncEnabled: true,
        }),
      );
    });

    it("should include cloud backup when turning every feature on with Warp", async () => {
      const user = userEvent.setup();
      mockBackupStatus.mockResolvedValue(
        backupStatus({ availability: "available" }),
      );
      render(<OnlineDeviceSetup connected warpActive={null} />);

      await user.click(
        await screen.findByRole("checkbox", {
          name: "online.features.allFeatures",
        }),
      );

      await waitFor(() =>
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          playtimeSyncEnabled: true,
          remoteControlEnabled: true,
          librarySyncEnabled: true,
          backupRemoteEnabled: true,
        }),
      );
    });

    it("should show the linked device, Warp and remote control status", async () => {
      mockBackupStatus.mockResolvedValue(
        backupStatus({ deviceName: "Living room", availability: "available" }),
      );
      mockRemoteActivity.mockResolvedValue({
        status: { state: "not_remote_device" },
      });
      render(<OnlineDeviceSetup connected warpActive={null} />);

      expect(await screen.findByText("Living room")).toBeInTheDocument();
      expect(
        screen.getByText("online.deviceLink.warpActive"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(
          "online.features.remoteStates.not_remote_device",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "online.features.remoteStateDetails.not_remote_device",
        ),
      ).toBeInTheDocument();
    });

    it("should unlink the device after confirmation", async () => {
      const user = userEvent.setup();
      render(<OnlineDeviceSetup connected warpActive={null} />);

      await user.click(
        await screen.findByRole("button", {
          name: "online.deviceLink.unlink",
        }),
      );
      expect(mockUnlink).not.toHaveBeenCalled();
      const confirm = screen.getByRole("dialog", {
        name: "online.deviceLink.unlinkConfirmTitle",
      });
      await user.click(
        within(confirm).getByRole("button", {
          name: "online.deviceLink.unlink",
        }),
      );

      await waitFor(() => expect(mockUnlink).toHaveBeenCalledOnce());
      expect(toast.success).toHaveBeenCalledWith("online.deviceLink.unlinked");
    });

    it("should not offer unlinking or remote status to clients without admin access", async () => {
      useStatusStore.setState({
        currentClient: {
          paired: true,
          role: "member",
          access: "member",
          capabilities: [],
        } as unknown as ClientsCurrentResponse,
      });
      mockUseClientCapability.mockReturnValue(false);
      render(<OnlineDeviceSetup connected warpActive={null} />);

      expect(
        await screen.findByText("online.features.librarySyncSummary"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "online.deviceLink.unlink" }),
      ).not.toBeInTheDocument();
      expect(mockRemoteActivity).not.toHaveBeenCalled();
    });
  });

  it("should hide library sync and remote control before Core supports them", async () => {
    useStatusStore.setState({ connected: true, coreVersion: "2.16.0" });
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: vi.fn(),
    });
    render(<OnlineDeviceSetup connected warpActive={false} />);

    expect(
      await screen.findByRole("checkbox", {
        name: "online.features.playHistory",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "online.features.librarySync" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "online.features.remoteControl" }),
    ).not.toBeInTheDocument();
    expect(mockRemoteActivity).not.toHaveBeenCalled();
  });

  it("should open sign-in in place when a signed-out user wants to link", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    useStatusStore.setState({ loggedInUser: null });
    render(
      <OnlineDeviceSetup connected warpActive={null} onSignIn={onSignIn} />,
    );

    await user.click(
      screen.getByRole("button", { name: "online.deviceLink.signIn" }),
    );

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

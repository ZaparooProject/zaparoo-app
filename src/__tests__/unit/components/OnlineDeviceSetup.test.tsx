import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { User } from "@capacitor-firebase/authentication";
import { render, screen, waitFor } from "@/test-utils";
import { useStatusStore } from "@/lib/store";

const {
  mockUseDeviceLinking,
  mockUseClientCapability,
  mockSettings,
  mockSettingsUpdate,
  mockBackupStatus,
} = vi.hoisted(() => ({
  mockUseDeviceLinking: vi.fn(),
  mockUseClientCapability: vi.fn(),
  mockSettings: vi.fn(),
  mockSettingsUpdate: vi.fn(),
  mockBackupStatus: vi.fn(),
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
  useRouter: () => ({ navigate: vi.fn() }),
}));

vi.mock("@/hooks/useDeviceLinking", () => ({
  useDeviceLinking: (enabled: boolean) => mockUseDeviceLinking(enabled),
}));

vi.mock("@/hooks/useClientCapability", () => ({
  useClientCapability: () => mockUseClientCapability(),
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    settings: () => mockSettings(),
    settingsUpdate: (params: unknown) => mockSettingsUpdate(params),
    settingsBackupStatus: () => mockBackupStatus(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
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

  it("should move focus to features when linking completes", async () => {
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { DeviceConnectionSummary } from "@/components/DeviceConnectionSummary";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "@/hooks/useConnection";
import { activeAddressOf, deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import {
  seedActiveDevice,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";

const { navigate, openPairingModal } = vi.hoisted(() => ({
  navigate: vi.fn(),
  openPairingModal: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ navigate }),
}));

const connection: ConnectionContextValue = {
  activeConnection: null,
  isConnected: true,
  hasData: true,
  showConnecting: false,
  showReconnecting: false,
  openPairingModal,
};

function renderSummary(overrides: Partial<ConnectionContextValue> = {}) {
  return render(
    <ConnectionContext.Provider value={{ ...connection, ...overrides }}>
      <DeviceConnectionSummary />
    </ConnectionContext.Provider>,
  );
}

async function enterAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "settings.deviceHistory" }),
  );
  const sheet = screen.getByRole("dialog", { name: "scan.deviceSheetTitle" });
  await user.click(
    within(sheet).getByRole("button", {
      name: "settings.deviceSetup.addDeviceManually",
    }),
  );
  return screen.getByRole("dialog", {
    name: "settings.deviceSetup.enterAddress",
  });
}

describe("DeviceConnectionSummary", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await seedActiveDevice({
      address: "192.168.1.100",
      name: "Living room MiSTer",
    });
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      connectionError: "",
      encryptionState: "plaintext",
      pairingRequired: false,
      coreVersion: "2.18.0",
      corePlatform: "MiSTer",
      coreVersionPending: false,
      currentClient: null,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows device identity and status with pairing but without an address editor", () => {
    renderSummary();
    expect(
      screen.getByRole("heading", { name: /scan.connectedHeading/ }),
    ).toBeVisible();
    const summary = within(screen.getByRole("region"));
    expect(summary.getByText("Living room MiSTer")).toBeVisible();
    expect(summary.getByText("MiSTer (v2.18.0)")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "save" }),
    ).not.toBeInTheDocument();
    expect(
      summary.getByRole("button", { name: "pairing.openPairing" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "settings.deviceHistory" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("opens pairing directly from the connected-device summary", async () => {
    const user = userEvent.setup();
    renderSummary();
    await user.click(
      screen.getByRole("button", { name: "pairing.openPairing" }),
    );
    expect(openPairingModal).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "settings.deviceHistory" }),
    ).toBeVisible();
  });

  it.each([
    ["admin", "connection.clientRoleAdmin"],
    ["member", "connection.clientRoleMember"],
  ] as const)(
    "retains %s role information on supported Core",
    (role, label) => {
      useStatusStore.setState({
        currentClient: { paired: true, role, capabilities: [] },
      });
      renderSummary();
      expect(within(screen.getByRole("region")).getByText(label)).toBeVisible();
    },
  );

  it("hides role information on older Core versions", () => {
    useStatusStore.setState({
      coreVersion: "2.15.0",
      currentClient: { paired: true, role: "admin", capabilities: [] },
    });
    renderSummary();
    expect(
      screen.queryByText("connection.clientRoleAdmin"),
    ).not.toBeInTheDocument();
  });

  it("opens shared device sheet and restores focus on dismissal", async () => {
    const user = userEvent.setup();
    renderSummary();
    const change = screen.getByRole("button", {
      name: "settings.deviceHistory",
    });
    await user.click(change);
    expect(
      screen.getByRole("dialog", { name: "scan.deviceSheetTitle" }),
    ).toBeVisible();
    expect(change).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(change).toHaveFocus();
  });

  it("offers manual entry on web and returns focus to its action when canceled", async () => {
    const user = userEvent.setup();
    renderSummary();
    const manual = within(await enterAddress(user));
    const input = manual.getByRole("textbox", { name: "settings.device" });
    expect(input).toHaveValue("192.168.1.100");
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "another.local");
    await user.click(manual.getByRole("button", { name: "nav.cancel" }));
    const sheet = within(
      screen.getByRole("dialog", { name: "scan.deviceSheetTitle" }),
    );
    expect(
      sheet.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).toHaveFocus();
    expect(
      sheet.queryByRole("button", { name: "settings.networkScan.refresh" }),
    ).not.toBeInTheDocument();
    expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe("192.168.1.100");
    await user.click(
      sheet.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "settings.device" }),
    ).toHaveValue("192.168.1.100");
  });

  it.each([
    ["", "settings.deviceAddressRequired"],
    ["192.168.1.286", "settings.deviceAddressInvalid"],
  ])(
    "rejects invalid address %j without changing device",
    async (address, error) => {
      const user = userEvent.setup();
      renderSummary();
      const manual = within(await enterAddress(user));
      const input = manual.getByRole("textbox", { name: "settings.device" });
      await user.clear(input);
      if (address) await user.type(input, address);
      await user.click(
        manual.getByRole("button", { name: "settings.deviceSetup.connect" }),
      );
      expect(manual.getByRole("alert")).toHaveTextContent(error);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveFocus();
      expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(
        "192.168.1.100",
      );
      expect(Object.keys(deviceRegistry.getSnapshot().records)).toHaveLength(1);
    },
  );

  it("clears validation on edit and connects once with Enter", async () => {
    const user = userEvent.setup();
    const select = vi.spyOn(deviceRegistry, "selectAddress");
    renderSummary();
    const manual = within(await enterAddress(user));
    const input = manual.getByRole("textbox", { name: "settings.device" });
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(manual.getByRole("alert")).toBeVisible();
    await user.type(input, "  other.local:7498  ");
    expect(manual.queryByRole("alert")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(
        "other.local:7498",
      ),
    );
    expect(select).toHaveBeenCalledExactlyOnceWith("other.local:7498");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "settings.deviceHistory" }),
    ).toHaveFocus();
  });

  it("reopens device selection rather than a discarded manual draft", async () => {
    const user = userEvent.setup();
    renderSummary();
    const manual = within(await enterAddress(user));
    await user.clear(manual.getByRole("textbox"));
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "settings.deviceHistory" }),
    );
    expect(
      screen.getByRole("dialog", { name: "scan.deviceSheetTitle" }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("dialog", { name: "scan.deviceSheetTitle" }),
      ).queryByRole("alert"),
    ).not.toBeInTheDocument();
  });

  it("keeps connection failure and device selection visible", () => {
    useStatusStore.setState({
      connectionError: "Connection failed: device is unreachable",
    });
    renderSummary({ isConnected: false });
    expect(
      within(screen.getByRole("region")).getByText(
        "Connection failed: device is unreachable",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "settings.deviceHistory" }),
    ).toBeVisible();
  });

  it("offers direct pairing recovery before an authenticated connection exists", async () => {
    const user = userEvent.setup();
    useStatusStore.setState({
      pairingRequired: true,
      encryptionState: "unknown",
    });
    renderSummary({ isConnected: false, showReconnecting: true });
    expect(
      screen.getByRole("heading", { name: "connection.pairingRequired" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "pairing.openPairing" }),
    );
    expect(openPairingModal).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "settings.deviceHistory" }),
    ).toBeVisible();
  });

  it.each([
    [{ showConnecting: true }, "connection.connectingToCore"],
    [{ showReconnecting: true }, "connection.reconnectingToCore"],
  ])("retains connection progress %j", (overrides, heading) => {
    renderSummary({ isConnected: false, ...overrides });
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
  });

  it("offers initial connection without a saved device", async () => {
    const user = userEvent.setup();
    await seedDeviceRegistry([]);
    renderSummary({ isConnected: false });
    expect(
      within(screen.getByRole("region")).getByText(
        "settings.enterDeviceAddress",
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "settings.deviceSetup.connect" }),
    );
    const sheet = within(
      screen.getByRole("dialog", { name: "scan.deviceSheetTitle" }),
    );
    await user.click(
      sheet.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "settings.device" }),
    ).toHaveValue("");
  });
});

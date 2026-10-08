import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Capacitor } from "@capacitor/core";
import { ZeroConf } from "capacitor-zeroconf";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { Devices } from "@/routes/-pages/Devices";
import { Settings } from "@/routes/settings.index";
import { ConnectionContext } from "@/hooks/useConnection";
import { activeAddressOf, deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";
import { __simulateDeviceDiscovered } from "../../../__mocks__/capacitor-zeroconf";

function responsiveWindow(initial: number) {
  let width = initial;
  const listeners = new Set<() => void>();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    get matches() {
      const minimum = /min-width:\s*(\d+)px/.exec(query);
      return minimum ? width >= Number(minimum[1]) : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: unknown) => {
      listeners.add(listener as () => void);
    },
    removeEventListener: (_type: string, listener: unknown) => {
      listeners.delete(listener as () => void);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }));
  return async (next: number) => {
    await act(() => {
      width = next;
      listeners.forEach((listener) => listener());
    });
  };
}
async function renderDevices(initial = "/settings/devices", connected = false) {
  const root = createRootRoute({ component: RootLayout });
  const devices = createRoute({
    getParentRoute: () => root,
    path: "/settings/devices",
    component: Devices,
  });
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: Settings,
  });
  const router = createRouter({
    routeTree: root.addChildren([devices, settings]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  return {
    ...render(
      <ConnectionContext.Provider
        value={{
          activeConnection: null,
          isConnected: connected,
          hasData: connected,
          showConnecting: false,
          showReconnecting: false,
          openPairingModal: vi.fn(),
        }}
      >
        <RouterProvider router={router} />
      </ConnectionContext.Provider>,
    ),
    router,
  };
}

describe("Adaptive Devices destination", () => {
  beforeEach(async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connectionState: ConnectionState.IDLE,
      coreVersion: "2.23.0",
      coreVersionPending: false,
      encryptionState: "plaintext",
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
    });
    await seedDeviceRegistry([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("should navigate from Settings sidebar to the complete Devices page without opening a sheet", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderDevices("/settings");
    const navigation = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    await user.click(
      within(navigation).getByRole("link", { name: "navigation.devices" }),
    );
    await screen.findByRole("heading", { name: "scan.deviceSheetAllDevices" });
    expect(router.state.location.pathname).toBe("/settings/devices");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "settings.savedDevices" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "navigation.devices" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("button", { name: "scan.devicePill" }),
    ).not.toBeInTheDocument();
  });

  it("should preserve manual address and focus through resizing then select that address in place", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderDevices();
    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    const input = screen.getByRole("textbox", { name: "settings.device" });
    await user.type(input, "living-room.local:9000");
    await resize(820);
    await resize(390);
    await resize(1440);
    expect(screen.getByRole("textbox", { name: "settings.device" })).toBe(
      input,
    );
    expect(input).toHaveValue("living-room.local:9000");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "settings.deviceSetup.connect" }),
    );
    await waitFor(() =>
      expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(
        "living-room.local:9000",
      ),
    );
    expect(router.state.location.pathname).toBe("/settings/devices");
    expect(
      screen.queryByRole("textbox", { name: "settings.device" }),
    ).not.toBeInTheDocument();
    expect(ZeroConf.watch).not.toHaveBeenCalled();
  });

  it("should switch a saved device directly while retaining record management", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const living = mockDeviceRecord({
      name: "Living room",
      address: "living.local",
    });
    const office = mockDeviceRecord({
      name: "Office",
      address: "office.local",
    });
    await seedDeviceRegistry([living, office], living.recordId);
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
    });
    await renderDevices("/settings/devices", true);
    const saved = within(
      screen.getByRole("region", { name: "settings.savedDevices" }),
    );
    expect(
      saved.getByRole("button", { name: /Living room/ }),
    ).toBeInTheDocument();
    const connect = saved.getAllByRole("button", {
      name: "settings.connectDevice",
    });
    expect(connect[0]).toBeDisabled();
    await user.click(connect[1]!);
    await waitFor(() =>
      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(office.recordId),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(Object.keys(deviceRegistry.getSnapshot().records)).toHaveLength(2);
  });

  it("should keep one discovery owner through resizing and release it for manual entry and unmount", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { unmount } = await renderDevices();
    await waitFor(() => expect(ZeroConf.watch).toHaveBeenCalledTimes(1));
    act(() =>
      __simulateDeviceDiscovered({
        domain: "local.",
        type: "_zaparoo._tcp.",
        name: "Nearby Core",
        hostname: "nearby.local",
        port: 7497,
        ipv4Addresses: ["192.168.1.90"],
        ipv6Addresses: [],
        txtRecord: { id: "nearby-id" },
      }),
    );
    const nearby = within(
      screen.getByRole("region", { name: "settings.networkScan.title" }),
    );
    await nearby.findByRole("button", { name: /Nearby Core/ });
    await resize(820);
    await resize(390);
    await resize(1440);
    expect(ZeroConf.watch).toHaveBeenCalledTimes(1);
    expect(ZeroConf.unwatch).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    await waitFor(() => expect(ZeroConf.unwatch).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "nav.cancel" }));
    await waitFor(() => expect(ZeroConf.watch).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).toHaveFocus();
    await user.click(
      within(
        screen.getByRole("region", { name: "settings.networkScan.title" }),
      ).getByRole("button", { name: /Nearby Core/ }),
    );
    await waitFor(() =>
      expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(
        "nearby.local",
      ),
    );
    expect(
      screen.getByRole("region", { name: "settings.savedDevices" }),
    ).toHaveTextContent("Nearby Core");
    expect(
      screen.getByRole("region", { name: "scan.deviceSheetTitle" }),
    ).toHaveFocus();
    unmount();
    await waitFor(() => expect(ZeroConf.unwatch).toHaveBeenCalledTimes(2));
  });
});

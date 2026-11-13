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
import { responsiveWindow } from "@/test-utils/responsiveWindow";

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
  const details = createRoute({
    getParentRoute: () => root,
    path: "/settings/devices/$recordId",
    component: () => <h1>device details</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([devices, details, settings]),
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

const savedList = () =>
  screen.getByRole("region", { name: "settings.savedDevices" });

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "settings.addDevice" }),
  );
  return screen.findByRole("dialog", { name: "scan.deviceSheetTitle" });
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

  it("should navigate from Settings sidebar to the Devices page, which lists saved devices and opens the sheet only on request", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    await seedDeviceRegistry(
      [mockDeviceRecord({ name: "Living room", address: "living.local" })],
      null,
    );
    const { router } = await renderDevices("/settings");
    const navigation = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    await user.click(
      within(navigation).getByRole("link", { name: "nav.devices" }),
    );
    await screen.findByRole("heading", { name: "scan.deviceSheetAllDevices" });
    expect(router.state.location.pathname).toBe("/settings/devices");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).not.toBeInTheDocument();
    expect(savedList()).toBeVisible();
    expect(
      within(savedList()).getByRole("button", { name: /Living room/ }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "nav.devices" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("button", { name: "scan.devicePill" }),
    ).not.toBeInTheDocument();

    const sheet = await openSheet(user);
    expect(
      within(sheet).getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(router.state.location.pathname).toBe("/settings/devices");
  });

  it("should preserve manual address and focus in the sheet through resizing then select that address", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderDevices();
    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    const manual = () =>
      within(
        screen.getByRole("dialog", {
          name: "settings.deviceSetup.enterAddress",
        }),
      );
    const input = manual().getByRole("textbox", { name: "settings.device" });
    await user.type(input, "living-room.local:9000");
    await resize(820);
    await resize(390);
    await resize(1440);
    expect(manual().getByRole("textbox", { name: "settings.device" })).toBe(
      input,
    );
    expect(input).toHaveValue("living-room.local:9000");
    expect(input).toHaveFocus();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(
      manual().getByRole("button", { name: "settings.deviceSetup.connect" }),
    );
    await waitFor(() =>
      expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(
        "living-room.local:9000",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/settings/devices");
    expect(
      screen.queryByRole("textbox", { name: "settings.device" }),
    ).not.toBeInTheDocument();
    expect(
      within(savedList()).getByRole("button", {
        name: /living-room\.local:9000/,
      }),
    ).toBeVisible();
    expect(ZeroConf.watch).not.toHaveBeenCalled();
  });

  it("should switch a saved device from the sheet while record management stays on the page", async () => {
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
    const { router } = await renderDevices("/settings/devices", true);
    const saved = within(savedList());
    expect(
      saved.getByRole("button", { name: /Living room/ }),
    ).toBeInTheDocument();
    expect(saved.getByRole("button", { name: /Office/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "settings.connectDevice" }),
    ).not.toBeInTheDocument();

    const sheet = await openSheet(user);
    const switchList = within(
      within(sheet).getByRole("region", { name: "scan.deviceSheetRecent" }),
    );
    expect(
      switchList.queryByRole("button", { name: /Living room/ }),
    ).not.toBeInTheDocument();
    await user.click(switchList.getByRole("button", { name: /Office/ }));
    await waitFor(() =>
      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(office.recordId),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(Object.keys(deviceRegistry.getSnapshot().records)).toHaveLength(2);
    expect(router.state.location.pathname).toBe("/settings/devices");

    await user.click(
      within(savedList()).getByRole("button", { name: /Living room/ }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/settings/devices/${living.recordId}`,
      ),
    );
    expect(deviceRegistry.getSnapshot().activeRecordId).toBe(office.recordId);
  });

  it("should run discovery only while the sheet is open, with one owner through resizing, released for manual entry, close and unmount", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { unmount } = await renderDevices();
    await screen.findByRole("button", { name: "settings.addDevice" });
    expect(ZeroConf.watch).not.toHaveBeenCalled();

    const sheet = await openSheet(user);
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
    const found = () =>
      within(screen.getByRole("region", { name: "scan.deviceSheetRecent" }));
    await found().findByRole("button", { name: /Nearby Core/ });
    expect(savedList()).not.toHaveTextContent("Nearby Core");
    await resize(820);
    await resize(390);
    await resize(1440);
    expect(ZeroConf.watch).toHaveBeenCalledTimes(1);
    expect(ZeroConf.unwatch).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toEqual([sheet]);
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
      await found().findByRole("button", { name: /Nearby Core/ }),
    );
    await waitFor(() =>
      expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(
        "nearby.local",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(ZeroConf.unwatch).toHaveBeenCalledTimes(2));
    expect(savedList()).toHaveTextContent("Nearby Core");
    expect(ZeroConf.watch).toHaveBeenCalledTimes(2);

    await openSheet(user);
    await waitFor(() => expect(ZeroConf.watch).toHaveBeenCalledTimes(3));
    unmount();
    await waitFor(() => expect(ZeroConf.unwatch).toHaveBeenCalledTimes(3));
  });
});

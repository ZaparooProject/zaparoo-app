import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { ZeroConf } from "capacitor-zeroconf";
import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor, within } from "@/test-utils";
import { DeviceConnectionSummary } from "@/components/DeviceConnectionSummary";
import { activeAddressOf, deviceRegistry } from "@/lib/devices/deviceRegistry";
import { useStatusStore } from "@/lib/store";
import {
  seedDeviceRegistry,
  mockDeviceRecord,
} from "@/test-utils/deviceRegistry";
import {
  __simulateDeviceDiscovered,
  type ZeroConfService,
} from "../../../__mocks__/capacitor-zeroconf";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ navigate: vi.fn() }),
}));

function service(overrides: Partial<ZeroConfService> = {}): ZeroConfService {
  return {
    domain: "local.",
    type: "_zaparoo._tcp.",
    name: "MiSTer",
    port: 7497,
    hostname: "mister.local",
    ipv4Addresses: ["192.168.1.100"],
    ipv6Addresses: [],
    txtRecord: { id: "mister-id", version: "2.18.0", platform: "mister" },
    ...overrides,
  };
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  render(<DeviceConnectionSummary />);
  await user.click(
    screen.getByRole("button", {
      name: /settings.deviceSetup.connect|settings.deviceHistory/,
    }),
  );
  return screen.getByRole("dialog", { name: "scan.deviceSheetTitle" });
}

async function waitForScan() {
  await waitFor(() => expect(ZeroConf.watch).toHaveBeenCalled());
}

describe("Shared device discovery flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    await seedDeviceRegistry([]);
    useStatusStore.setState({ connectionError: "", pairingRequired: false });
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows discovered device identity and metadata while scanning", async () => {
    const user = userEvent.setup();
    const sheet = within(await openSheet(user));
    await waitForScan();
    act(() => __simulateDeviceDiscovered(service()));
    act(() =>
      __simulateDeviceDiscovered(
        service({
          name: "Office PC",
          hostname: "office.local",
          ipv4Addresses: ["192.168.1.101"],
          txtRecord: { id: "office-id" },
        }),
      ),
    );
    expect(await sheet.findByRole("button", { name: /MiSTer/ })).toBeVisible();
    expect(sheet.getByRole("button", { name: /Office PC/ })).toBeVisible();
    expect(sheet.getByText("mister.local")).toBeVisible();
    expect(sheet.getByText("mister")).toBeVisible();
    expect(sheet.getByText("settings.networkScan.version")).toBeVisible();
    expect(sheet.getByText("settings.networkScan.searching")).toBeVisible();
  });

  it.each([
    { hostname: "mister.local.", port: 7497, expected: "mister.local" },
    { hostname: "mister.local", port: 9000, expected: "mister.local:9000" },
    { hostname: "", port: 7497, expected: "192.168.1.100" },
  ])(
    "saves and connects discovery at $expected",
    async ({ hostname, port, expected }) => {
      const user = userEvent.setup();
      const sheet = within(await openSheet(user));
      await waitForScan();
      act(() => __simulateDeviceDiscovered(service({ hostname, port })));
      expect(await sheet.findByText(expected)).toBeVisible();
      await user.click(sheet.getByRole("button", { name: /MiSTer/ }));
      await waitFor(() =>
        expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(expected),
      );
      const registry = deviceRegistry.getSnapshot();
      expect(registry.records[registry.activeRecordId!]).toMatchObject({
        discoveryId: "mister-id",
        name: "MiSTer",
        platform: "mister",
        version: "2.18.0",
        endpoints: [
          expect.objectContaining({
            port,
            source: "mdns",
            resolvedAddresses: ["192.168.1.100"],
          }),
        ],
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(ZeroConf.unwatch).toHaveBeenCalled());
    },
  );

  it("merges matching discovery with saved devices and selects the existing record", async () => {
    const saved = mockDeviceRecord({
      address: "mister.local",
      name: "Living room",
      discoveryId: "mister-id",
    });
    await seedDeviceRegistry([saved], null);
    const user = userEvent.setup();
    const sheet = within(await openSheet(user));
    await waitForScan();
    act(() => __simulateDeviceDiscovered(service()));
    const list = within(
      sheet.getByRole("region", { name: "scan.deviceSheetRecent" }),
    );
    expect(
      list
        .getAllByRole("button")
        .filter((button) => button.textContent?.includes("Living room")),
    ).toHaveLength(1);
    expect(
      list.queryByRole("button", { name: /MiSTer/ }),
    ).not.toBeInTheDocument();
    await user.click(list.getByRole("button", { name: /Living room/ }));
    await waitFor(() =>
      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(saved.recordId),
    );
    expect(Object.keys(deviceRegistry.getSnapshot().records)).toHaveLength(1);
  });

  it("stops discovery during manual entry and resumes on cancel", async () => {
    const user = userEvent.setup();
    const sheet = within(await openSheet(user));
    await waitForScan();
    await user.click(
      sheet.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    const manual = within(
      screen.getByRole("dialog", { name: "settings.deviceSetup.enterAddress" }),
    );
    expect(
      manual.getByRole("textbox", { name: "settings.device" }),
    ).toHaveFocus();
    await waitFor(() => expect(ZeroConf.unwatch).toHaveBeenCalled());
    await user.click(manual.getByRole("button", { name: "nav.cancel" }));
    await waitFor(() => expect(ZeroConf.watch).toHaveBeenCalledTimes(2));
    expect(
      sheet.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(ZeroConf.unwatch).toHaveBeenCalledTimes(2));
  });

  it("keeps manual connection available when discovery fails", async () => {
    vi.mocked(ZeroConf.watch).mockRejectedValueOnce(
      new Error("Discovery unavailable"),
    );
    const user = userEvent.setup();
    const sheet = within(await openSheet(user));
    expect(await sheet.findByRole("alert")).toBeVisible();
    await user.click(
      sheet.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    const manual = within(
      screen.getByRole("dialog", { name: "settings.deviceSetup.enterAddress" }),
    );
    await user.type(
      manual.getByRole("textbox", { name: "settings.device" }),
      "fallback.local",
    );
    await user.click(
      manual.getByRole("button", { name: "settings.deviceSetup.connect" }),
    );
    await waitFor(() =>
      expect(activeAddressOf(deviceRegistry.getSnapshot())).toBe(
        "fallback.local",
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not start native discovery on web but still offers manual connection", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const user = userEvent.setup();
    const sheet = within(await openSheet(user));
    expect(ZeroConf.watch).not.toHaveBeenCalled();
    expect(
      sheet.queryByRole("button", { name: "settings.networkScan.refresh" }),
    ).not.toBeInTheDocument();
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { Preferences } from "@capacitor/preferences";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
  type DeviceRecordOptions,
} from "@/test-utils/deviceRegistry";

const { componentRef, mockNavigate } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ navigate: mockNavigate }),
    Link: ({
      children,
      to,
      params,
      "aria-label": ariaLabel,
      className,
    }: {
      children: React.ReactNode;
      to: string;
      params?: Record<string, string>;
      "aria-label"?: string;
      className?: string;
    }) => {
      const href = params
        ? to.replace(/\$(\w+)/g, (_m, key) => params[key] ?? "")
        : to;
      return (
        <a href={href} aria-label={ariaLabel} className={className}>
          {children}
        </a>
      );
    },
  };
});

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

vi.mock("@/hooks/useConnection", () => ({
  useConnection: () => ({ isConnected: true }),
}));

import "@/routes/settings.devices";

const getDevices = () => componentRef.current;

const credentials: StoredCredentials = {
  authToken: "token-abc",
  pairingKey: "a".repeat(64),
  clientId: "client-uuid-1234",
  pairedAt: 1700000000000,
};

async function seedRecords(
  entries: DeviceRecordOptions[],
  activeIndex: number | null = null,
) {
  const records = entries.map((entry) => mockDeviceRecord(entry));
  await seedDeviceRegistry(
    records,
    activeIndex === null ? null : (records[activeIndex]?.recordId ?? null),
  );
  return records;
}

describe("Settings Devices Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderRoute = () => {
    const Devices = getDevices();
    return render(<Devices />);
  };

  it("should render the empty state when no devices are saved", async () => {
    await seedDeviceRegistry([]);
    renderRoute();

    expect(
      await screen.findByText("settings.deviceHistoryEmpty"),
    ).toBeInTheDocument();
  });

  it("should not claim there are no devices while the registry is still loading", async () => {
    // An unhydrated registry holds no records for the same reason a brand new
    // install holds none. Telling the second story to the first user invites
    // them to re-pair devices they already own.
    renderRoute();

    expect(
      screen.queryByText("settings.deviceHistoryEmpty"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("settings.deviceHistoryLoading"),
    ).toBeInTheDocument();

    await act(async () => {
      await seedRecords([{ address: "192.168.1.10", name: "Alpha" }]);
    });

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(
      screen.queryByText("settings.deviceHistoryLoading"),
    ).not.toBeInTheDocument();
  });

  it("should distinguish a failed registry read from having no devices", async () => {
    // Telling a user whose registry failed to load that they have never saved a
    // device invites them to re-pair devices they already own.
    vi.mocked(Preferences.get).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await deviceRegistry.hydrate();
    renderRoute();

    expect(
      await screen.findByText("settings.deviceHistoryError"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings.deviceHistoryEmpty"),
    ).not.toBeInTheDocument();
  });

  it("should render one row per record, sorted alphabetically", async () => {
    await seedRecords([
      { address: "192.168.1.10", name: "Zulu" },
      { address: "192.168.1.11", name: "Alpha" },
      { address: "192.168.1.12", name: "Mike" },
    ]);

    renderRoute();

    await waitFor(() => {
      const names = screen
        .getAllByText(/Alpha|Mike|Zulu/)
        .map((element) => element.textContent);
      expect(names).toEqual(["Alpha", "Mike", "Zulu"]);
    });
  });

  it("should mark the currently connected device as active", async () => {
    await seedRecords(
      [
        { address: "192.168.1.10", name: "Active" },
        { address: "192.168.1.11", name: "Other" },
      ],
      0,
    );

    renderRoute();

    expect(
      await screen.findByLabelText("settings.activeDevice"),
    ).toBeInTheDocument();
  });

  it("should show the lock icon only on rows whose record holds credentials", async () => {
    const [, paired] = await seedRecords([
      { address: "192.168.1.10", name: "Unpaired" },
      { address: "192.168.1.11", name: "Paired" },
    ]);
    await credentialStore.set(
      credentialKeyForRecord(paired!.recordId),
      credentials,
    );

    renderRoute();

    await waitFor(() => {
      expect(screen.getAllByLabelText("connection.encrypted")).toHaveLength(1);
    });
  });

  it("should show the lock icon for a migrated record still on its pre-V2 key", async () => {
    // The pairing only moves to the canonical key on the first encrypted
    // connect, so until then the address key is where it lives.
    await seedRecords([
      {
        address: "192.168.1.10",
        name: "Migrated",
        legacyCredentialKey: "192.168.1.10",
      },
    ]);
    await credentialStore.set("192.168.1.10", credentials);

    renderRoute();

    await waitFor(() => {
      expect(screen.getAllByLabelText("connection.encrypted")).toHaveLength(1);
    });
  });

  it("should make the tapped record active and return to settings", async () => {
    const user = userEvent.setup();
    const [first, second] = await seedRecords(
      [
        { address: "192.168.1.20", name: "Pick me" },
        { address: "192.168.1.21", name: "Not me" },
      ],
      1,
    );
    expect(deviceRegistry.getSnapshot().activeRecordId).toBe(second!.recordId);

    renderRoute();
    await user.click(screen.getByText("Pick me"));

    await waitFor(() => {
      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(first!.recordId);
    });
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("should link each row to its record's detail page", async () => {
    const [record] = await seedRecords([
      { address: "192.168.1.30", name: "With Info" },
    ]);

    renderRoute();

    expect(
      await screen.findByLabelText("settings.deviceDetails"),
    ).toHaveAttribute("href", `/settings/devices/${record!.recordId}`);
  });

  it("should not expose manual device-combining controls", async () => {
    await seedRecords([
      { address: "steamdeck.local", name: "Steamdeck" },
      { address: "10.0.0.206", name: "Steamdeck alias" },
    ]);

    renderRoute();

    expect(
      await screen.findAllByLabelText("settings.deviceDetails"),
    ).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("should navigate to Settings without resetting scroll", async () => {
    const user = userEvent.setup();
    await seedDeviceRegistry([]);
    renderRoute();

    await user.click(screen.getByLabelText("nav.back"));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings",
      resetScroll: false,
    });
  });
});

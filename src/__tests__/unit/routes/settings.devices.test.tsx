import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Preferences } from "@capacitor/preferences";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import { CoreAPI } from "@/lib/coreApi";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
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
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.reset();
    useStatusStore.setState({
      connected: false,
      connectionState: ConnectionState.IDLE,
      connectionError: "",
      coreVersion: null,
      corePlatform: null,
      coreVersionPending: false,
      currentClient: null,
      encryptionState: "unknown",
      pairingRequired: false,
    });
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  const renderRoute = () => {
    const Devices = getDevices();
    return render(
      <QueryClientProvider client={queryClient}>
        <Devices />
      </QueryClientProvider>,
    );
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

  it("should combine two manually selected records after confirmation", async () => {
    const user = userEvent.setup();
    const [hostname, activeIp] = await seedRecords(
      [
        { address: "steamdeck.local", name: "Steamdeck" },
        { address: "10.0.0.206", name: "Steamdeck" },
      ],
      1,
    );
    queryClient.setQueryData(["library", hostname!.recordId], "hostname cache");
    queryClient.setQueryData(["library", activeIp!.recordId], "ip cache");
    renderRoute();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.edit" }),
    );
    const selections = screen.getAllByRole("checkbox", {
      name: "settings.deviceCombine.select",
    });
    await user.click(selections[0]!);
    await user.click(selections[1]!);
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.action" }),
    );
    expect(screen.getByText("settings.deviceCombine.body")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.confirm" }),
    );

    await waitFor(() => {
      expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
        activeIp!.recordId,
      ]);
    });
    expect(deviceRegistry.getSnapshot().activeRecordId).toBe(
      activeIp!.recordId,
    );
    expect(
      deviceRegistry.getSnapshot().records[activeIp!.recordId]?.endpoints,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ host: "steamdeck.local" }),
        expect.objectContaining({ host: "10.0.0.206" }),
      ]),
    );
    expect(
      queryClient.getQueryData(["library", hostname!.recordId]),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(["library", activeIp!.recordId]),
    ).toBeUndefined();
  });

  it("should keep the paired indicator after moving source credentials", async () => {
    const user = userEvent.setup();
    const [activeTarget, pairedSource] = await seedRecords(
      [
        { address: "steamdeck.local", name: "Steamdeck" },
        { address: "10.0.0.206", name: "Steamdeck alias" },
      ],
      0,
    );
    await credentialStore.set(
      credentialKeyForRecord(pairedSource!.recordId),
      credentials,
    );
    renderRoute();
    expect(
      await screen.findByLabelText("connection.encrypted"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.edit" }),
    );
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.action" }),
    );
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.confirm" }),
    );

    await waitFor(() => {
      expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
        activeTarget!.recordId,
      ]);
    });
    expect(screen.getByLabelText("connection.encrypted")).toBeInTheDocument();
  });

  it("should keep shared legacy pairing visible on an unmerged record", async () => {
    const user = userEvent.setup();
    const sharedLegacyKey = "shared-device-key";
    const [activeTarget, , sharedOwner] = await seedRecords(
      [
        { address: "steamdeck.local", name: "A target" },
        {
          address: "10.0.0.206",
          name: "B source",
          legacyCredentialKey: sharedLegacyKey,
        },
        {
          address: "10.0.0.207",
          name: "C shared owner",
          legacyCredentialKey: sharedLegacyKey,
        },
      ],
      0,
    );
    await credentialStore.set(sharedLegacyKey, credentials);
    renderRoute();

    expect(
      await screen.findAllByLabelText("connection.encrypted"),
    ).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.edit" }),
    );
    const selections = screen.getAllByRole("checkbox", {
      name: "settings.deviceCombine.select",
    });
    await user.click(selections[0]!);
    await user.click(selections[1]!);
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.action" }),
    );
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.confirm" }),
    );

    await waitFor(() => {
      expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
        activeTarget!.recordId,
        sharedOwner!.recordId,
      ]);
    });
    expect(await credentialStore.get(sharedLegacyKey)).toEqual(credentials);
    expect(
      await credentialStore.get(credentialKeyForRecord(activeTarget!.recordId)),
    ).toEqual(credentials);
    expect(screen.getAllByLabelText("connection.encrypted")).toHaveLength(2);
  });

  it("should retain both selected records when combining fails", async () => {
    const user = userEvent.setup();
    const records = await seedRecords([
      { address: "steamdeck.local", name: "Steamdeck" },
      { address: "10.0.0.206", name: "Steamdeck" },
    ]);
    vi.spyOn(deviceRegistry, "mergeRecords").mockRejectedValueOnce(
      new Error("keychain locked"),
    );
    renderRoute();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.edit" }),
    );
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.action" }),
    );
    await user.click(
      screen.getByRole("button", { name: "settings.deviceCombine.confirm" }),
    );

    expect(
      await screen.findByText("settings.deviceCombine.failed"),
    ).toHaveAttribute("role", "alert");
    expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual(
      records.map((record) => record.recordId),
    );
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

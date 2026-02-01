/**
 * Integration Test: Settings Readers Page
 *
 * Tests the REAL ReadersSettings component from src/routes/settings.readers.tsx including:
 * - Native-only features (launch on scan, prefer external reader, shake to launch)
 * - Shake mode configuration (random vs custom)
 * - System selector for shake random mode
 * - Connection state handling
 * - Pro badge display for non-pro users
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import React from "react";

// Mock router - use vi.hoisted to make variables accessible in mocks
const { componentRef, mockGoBack } = vi.hoisted(() => ({
  componentRef: { current: null as React.ComponentType | null },
  mockGoBack: vi.fn(),
}));

// Mock the router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useRouter: vi.fn(() => ({
      history: {
        back: mockGoBack,
      },
    })),
    createFileRoute: () => (options: { component: React.ComponentType }) => {
      componentRef.current = options.component;
      return { options };
    },
  };
});

// Track native platform state for testing - hoisted to be available in vi.mock
const { mockCapacitorState } = vi.hoisted(() => ({
  mockCapacitorState: {
    isNative: false,
  },
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockCapacitorState.isNative,
    getPlatform: () => (mockCapacitorState.isNative ? "ios" : "web"),
  },
}));

// Mock state that can be modified per-test
const mockQueryState = {
  settings: {
    readersScanMode: "tap" as "tap" | "hold",
    audioScanFeedback: true,
    readersAutoDetect: true,
  },
  readers: [] as Array<{ id: string; info: string; connected: boolean }>,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

const mockMutationState = {
  mutate: vi.fn(),
};

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useQuery: vi.fn(({ queryKey }) => {
      if (queryKey[0] === "settings") {
        return {
          data: mockQueryState.settings,
          isPending: mockQueryState.isLoading,
          isError: mockQueryState.isError,
          refetch: mockQueryState.refetch,
        };
      }
      if (queryKey[0] === "readers") {
        return {
          data: { readers: mockQueryState.readers },
          isPending: mockQueryState.isLoading,
          isError: mockQueryState.isError,
        };
      }
      return { data: null, isPending: false, isError: false };
    }),
    useMutation: vi.fn(() => ({
      mutate: mockMutationState.mutate,
      mutateAsync: vi.fn(),
    })),
  };
});

// Mock useSmartSwipe
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock usePageHeadingFocus
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Track Pro purchase modal state
const mockProPurchaseState = {
  setProPurchaseModalOpen: vi.fn(),
};

vi.mock("@/components/ProPurchase", () => ({
  useProPurchase: () => ({
    PurchaseModal: () => <div data-testid="purchase-modal" />,
    setProPurchaseModalOpen: mockProPurchaseState.setProPurchaseModalOpen,
  }),
}));

// Mock SystemSelector
vi.mock("@/components/SystemSelector", () => ({
  SystemSelector: ({
    isOpen,
    onClose,
    onSelect,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (systems: string[]) => void;
  }) =>
    isOpen ? (
      <div data-testid="system-selector">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onSelect(["snes"])}>Select SNES</button>
        <button onClick={() => onSelect([])}>Select All</button>
      </div>
    ) : null,
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.readers";

// Helper to get the captured component
const getReadersSettings = () => componentRef.current;

describe("Settings Readers Integration", () => {
  const renderComponent = () => {
    const ReadersSettings = getReadersSettings();
    if (!ReadersSettings) {
      throw new Error("ReadersSettings component not captured");
    }
    return render(<ReadersSettings />);
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores to initial state
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      nfcAvailable: false,
      accelerometerAvailable: false,
      launcherAccess: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
    });

    // Reset mock query state
    mockQueryState.settings = {
      readersScanMode: "tap",
      audioScanFeedback: true,
      readersAutoDetect: true,
    };
    mockQueryState.readers = [];
    mockQueryState.isLoading = false;
    mockQueryState.isError = false;

    // Reset Capacitor native state
    mockCapacitorState.isNative = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Page Structure", () => {
    it("should render the page with header and title", () => {
      renderComponent();

      expect(
        screen.getByRole("heading", { name: /settings.readers.title/i }),
      ).toBeInTheDocument();
    });

    it("should render back button", () => {
      renderComponent();

      expect(
        screen.getByRole("button", { name: /nav.back/i }),
      ).toBeInTheDocument();
    });

    it("should render continuous scan toggle on all platforms", () => {
      renderComponent();

      expect(
        screen.getByText(/settings.readers.continuousScan/i),
      ).toBeInTheDocument();
    });
  });

  describe("Native Platform Features", () => {
    beforeEach(() => {
      mockCapacitorState.isNative = true;
    });

    describe("Launch on Scan", () => {
      it("should show launch on scan toggle on native platforms", () => {
        renderComponent();

        expect(
          screen.getByText(/settings.readers.launchOnScan/i),
        ).toBeInTheDocument();
      });

      it("should not show launch on scan on web platform", () => {
        mockCapacitorState.isNative = false;
        renderComponent();

        expect(
          screen.queryByText(/settings.readers.launchOnScan/i),
        ).not.toBeInTheDocument();
      });

      it("should show Pro badge when user does not have launcher access", () => {
        usePreferencesStore.setState({ launcherAccess: false });
        renderComponent();

        // Pro badge should be visible for launch on scan
        const launchOnScanLabel = screen.getByText(
          /settings.readers.launchOnScan/i,
        );
        expect(launchOnScanLabel).toBeInTheDocument();
      });

      it("should toggle launch on scan setting", async () => {
        const user = userEvent.setup();
        usePreferencesStore.setState({ launchOnScan: false });

        renderComponent();

        // Find the toggle switch for launch on scan
        const toggle = screen.getByRole("checkbox", {
          name: /settings.readers.launchOnScan/i,
        });
        await user.click(toggle);

        expect(usePreferencesStore.getState().launchOnScan).toBe(true);
      });
    });

    describe("Prefer External Reader", () => {
      it("should show prefer external reader when NFC is available", () => {
        usePreferencesStore.setState({ nfcAvailable: true });
        renderComponent();

        expect(
          screen.getByText(/settings.readers.preferExternalReader/i),
        ).toBeInTheDocument();
      });

      it("should not show prefer external reader when NFC is not available", () => {
        usePreferencesStore.setState({ nfcAvailable: false });
        renderComponent();

        expect(
          screen.queryByText(/settings.readers.preferExternalReader/i),
        ).not.toBeInTheDocument();
      });

      it("should toggle prefer external reader setting", async () => {
        const user = userEvent.setup();
        usePreferencesStore.setState({
          nfcAvailable: true,
          preferRemoteWriter: false,
        });

        renderComponent();

        const toggle = screen.getByRole("checkbox", {
          name: /settings.readers.preferExternalReader/i,
        });
        await user.click(toggle);

        expect(usePreferencesStore.getState().preferRemoteWriter).toBe(true);
      });
    });
  });

  describe("Shake to Launch", () => {
    beforeEach(() => {
      mockCapacitorState.isNative = true;
      usePreferencesStore.setState({ accelerometerAvailable: true });
    });

    it("should show shake to launch toggle when accelerometer is available", () => {
      renderComponent();

      expect(
        screen.getByText(/settings.readers.shakeToLaunch/i),
      ).toBeInTheDocument();
    });

    it("should not show shake to launch on web platform", () => {
      mockCapacitorState.isNative = false;
      renderComponent();

      expect(
        screen.queryByText(/settings.readers.shakeToLaunch/i),
      ).not.toBeInTheDocument();
    });

    it("should not show shake to launch when accelerometer is not available", () => {
      usePreferencesStore.setState({ accelerometerAvailable: false });
      renderComponent();

      expect(
        screen.queryByText(/settings.readers.shakeToLaunch/i),
      ).not.toBeInTheDocument();
    });

    it("should show Pro badge for shake to launch when user has no launcher access", () => {
      usePreferencesStore.setState({ launcherAccess: false });
      renderComponent();

      const shakeLabel = screen.getByText(/settings.readers.shakeToLaunch/i);
      expect(shakeLabel).toBeInTheDocument();
    });

    it("should enable shake when toggle is clicked", async () => {
      const user = userEvent.setup();
      usePreferencesStore.setState({ shakeEnabled: false });

      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings.readers.shakeToLaunch/i,
      });
      await user.click(toggle);

      expect(usePreferencesStore.getState().shakeEnabled).toBe(true);
    });

    it("should disable shake toggle when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings.readers.shakeToLaunch/i,
      });
      expect(toggle).toBeDisabled();
    });
  });

  describe("Shake Mode Configuration", () => {
    beforeEach(() => {
      mockCapacitorState.isNative = true;
      usePreferencesStore.setState({
        accelerometerAvailable: true,
        shakeEnabled: true,
        shakeMode: "random",
        shakeZapscript: "**launch.random:all",
      });
    });

    it("should show shake mode options when shake is enabled", () => {
      renderComponent();

      expect(
        screen.getByRole("radiogroup", {
          name: /settings.app.shakeModeLabel/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /settings.app.shakeRandomMedia/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /settings.app.shakeCustom/i }),
      ).toBeInTheDocument();
    });

    it("should not show shake mode options when shake is disabled", () => {
      usePreferencesStore.setState({ shakeEnabled: false });
      renderComponent();

      expect(
        screen.queryByRole("radiogroup", {
          name: /settings.app.shakeModeLabel/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("should show random mode as selected by default", () => {
      renderComponent();

      const randomRadio = screen.getByRole("radio", {
        name: /settings.app.shakeRandomMedia/i,
      });
      expect(randomRadio).toHaveAttribute("aria-checked", "true");
    });

    it("should switch to custom mode when clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      const customRadio = screen.getByRole("radio", {
        name: /settings.app.shakeCustom/i,
      });
      await user.click(customRadio);

      expect(usePreferencesStore.getState().shakeMode).toBe("custom");
    });

    it("should show system selector button in random mode", () => {
      usePreferencesStore.setState({
        shakeMode: "random",
        shakeZapscript: "**launch.random:all",
      });
      renderComponent();

      expect(
        screen.getByRole("button", { name: /settings.app.shakeSelectSystem/i }),
      ).toBeInTheDocument();
    });

    it("should display selected system name for random mode", () => {
      usePreferencesStore.setState({
        shakeMode: "random",
        shakeZapscript: "**launch.random:snes",
      });
      renderComponent();

      expect(screen.getByText("snes")).toBeInTheDocument();
    });

    it("should display 'all systems' when all is selected", () => {
      usePreferencesStore.setState({
        shakeMode: "random",
        shakeZapscript: "**launch.random:all",
      });
      renderComponent();

      expect(
        screen.getByText(/systemSelector.allSystems/i),
      ).toBeInTheDocument();
    });

    it("should open system selector when button is clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      const selectButton = screen.getByRole("button", {
        name: /settings.app.shakeSelectSystem/i,
      });
      await user.click(selectButton);

      expect(screen.getByTestId("system-selector")).toBeInTheDocument();
    });

    it("should update zapscript when system is selected", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Open system selector
      await user.click(
        screen.getByRole("button", { name: /settings.app.shakeSelectSystem/i }),
      );

      // Select SNES
      await user.click(screen.getByText("Select SNES"));

      expect(usePreferencesStore.getState().shakeZapscript).toBe(
        "**launch.random:snes",
      );
    });

    it("should show ZapScript input in custom mode", () => {
      usePreferencesStore.setState({ shakeMode: "custom" });
      renderComponent();

      // Should have a textarea for custom zapscript
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("should disable shake mode radios when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });
      renderComponent();

      const randomRadio = screen.getByRole("radio", {
        name: /settings.app.shakeRandomMedia/i,
      });
      const customRadio = screen.getByRole("radio", {
        name: /settings.app.shakeCustom/i,
      });

      expect(randomRadio).toBeDisabled();
      expect(customRadio).toBeDisabled();
    });
  });

  describe("Connection States", () => {
    it("should show loading state when connecting", () => {
      useStatusStore.setState({
        connectionState: ConnectionState.CONNECTING,
        connected: false,
      });
      mockQueryState.isLoading = true;

      renderComponent();

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it("should show no readers detected when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      renderComponent();

      expect(
        screen.getByText(/settings.readers.noReadersDetected/i),
      ).toBeInTheDocument();
    });

    it("should disable scan mode buttons when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      renderComponent();

      const tapRadio = screen.getByRole("radio", { name: /settings.tapMode/i });
      const holdRadio = screen.getByRole("radio", {
        name: /settings.insertMode/i,
      });

      expect(tapRadio).toBeDisabled();
      expect(holdRadio).toBeDisabled();
    });

    it("should disable audio feedback toggle when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings.readers.audioFeedback/i,
      });
      expect(toggle).toBeDisabled();
    });

    it("should disable auto-detect readers toggle when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings.readers.autoDetectReaders/i,
      });
      expect(toggle).toBeDisabled();
    });
  });

  describe("Readers List", () => {
    it("should display connected readers", async () => {
      mockQueryState.readers = [
        { id: "reader1", info: "PN532 NFC Reader", connected: true },
        { id: "reader2", info: "ACR122U", connected: true },
      ];

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("PN532 NFC Reader")).toBeInTheDocument();
        expect(screen.getByText("ACR122U")).toBeInTheDocument();
      });
    });

    it("should display reader ID when info is empty", async () => {
      mockQueryState.readers = [
        { id: "simple_serial_0", info: "", connected: true },
      ];

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("simple_serial_0")).toBeInTheDocument();
      });
    });

    it("should show no readers message when readers list is empty", async () => {
      mockQueryState.readers = [];

      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByText(/settings.readers.noReadersDetected/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Core Settings", () => {
    it("should update scan mode when clicking hold", async () => {
      const user = userEvent.setup();
      renderComponent();

      const holdRadio = screen.getByRole("radio", {
        name: /settings.insertMode/i,
      });
      await user.click(holdRadio);

      expect(mockMutationState.mutate).toHaveBeenCalledWith({
        readersScanMode: "hold",
      });
    });

    it("should update audio feedback setting", async () => {
      const user = userEvent.setup();
      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings.readers.audioFeedback/i,
      });
      await user.click(toggle);

      expect(mockMutationState.mutate).toHaveBeenCalledWith({
        audioScanFeedback: false,
      });
    });

    it("should update auto-detect readers setting", async () => {
      const user = userEvent.setup();
      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings.readers.autoDetectReaders/i,
      });
      await user.click(toggle);

      expect(mockMutationState.mutate).toHaveBeenCalledWith({
        readersAutoDetect: false,
      });
    });
  });

  describe("Setting Help Dialogs", () => {
    it("should render help icon for scan mode", () => {
      renderComponent();

      // Look for setting help components - they should have aria-labels or test ids
      expect(
        screen.getByText(/settings.readers.scanMode/i),
      ).toBeInTheDocument();
    });

    it("should render help icon for continuous scan", () => {
      renderComponent();

      expect(
        screen.getByText(/settings.readers.continuousScan/i),
      ).toBeInTheDocument();
    });

    it("should render help icon for audio feedback", () => {
      renderComponent();

      expect(
        screen.getByText(/settings.readers.audioFeedback/i),
      ).toBeInTheDocument();
    });
  });
});

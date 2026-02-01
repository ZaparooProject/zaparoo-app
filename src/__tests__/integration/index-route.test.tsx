/**
 * Integration Test: Index Route (Home Page)
 *
 * Tests the REAL Index component from src/routes/index.tsx including:
 * - Page structure and accessibility
 * - Connection status display
 * - Scan controls visibility based on NFC/camera availability
 * - Last scanned token display
 * - Now playing info display
 * - History modal interactions
 * - Stop confirm modal interactions
 * - Write modal interactions
 * - Store state updates reflected in UI
 */

import React, { ReactNode } from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ScanResult } from "@/lib/models";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";

// Mock state that can be modified per-test
const mockScanOperationsState = {
  scanSession: false,
  scanStatus: ScanResult.Default,
  handleScanButton: vi.fn(),
  handleCameraScan: vi.fn(),
  handleStopConfirm: vi.fn(),
  runToken: vi.fn(),
};

const mockNfcWriterState = {
  write: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
  writing: false,
  result: null,
  status: null as null | string,
};

const mockHistoryQueryState = {
  data: undefined as
    | {
        entries: Array<{
          time: string;
          uid: string;
          text: string;
          success: boolean;
        }>;
      }
    | undefined,
  refetch: vi.fn(),
};

// Mock TanStack Router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createFileRoute: vi.fn(() => {
      return () => ({
        component: null,
      });
    }),
    // Mock Link component to avoid router context requirement
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
      [key: string]: unknown;
    }) => {
      return (
        <a href={to} {...props}>
          {children}
        </a>
      );
    },
  };
});

// Mock useScanOperations
vi.mock("@/hooks/useScanOperations", () => ({
  useScanOperations: vi.fn(() => mockScanOperationsState),
}));

// Mock useNfcWriter
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => mockNfcWriterState),
  WriteMethod: {
    Auto: "auto",
    LocalNFC: "local",
    RemoteReader: "remote",
  },
  WriteAction: {
    Write: "write",
    Read: "read",
    Format: "format",
    Erase: "erase",
    MakeReadOnly: "makeReadOnly",
  },
}));

// Use vi.hoisted for pro purchase mock
const { mockSetProPurchaseModalOpen, mockProPurchaseState } = vi.hoisted(
  () => ({
    mockSetProPurchaseModalOpen: vi.fn(),
    mockProPurchaseState: {
      proAccess: false,
      proPurchaseModalOpen: false,
    },
  }),
);

// Mock useProPurchase
vi.mock("@/components/ProPurchase", () => ({
  useProPurchase: vi.fn(() => ({
    proAccess: mockProPurchaseState.proAccess,
    PurchaseModal: () => null,
    proPurchaseModalOpen: mockProPurchaseState.proPurchaseModalOpen,
    setProPurchaseModalOpen: mockSetProPurchaseModalOpen,
  })),
}));

// Mock usePageHeadingFocus
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Use vi.hoisted for announcer mock
const { mockAnnounce } = vi.hoisted(() => ({
  mockAnnounce: vi.fn(),
}));

// Mock useAnnouncer but keep the Provider
vi.mock("@/components/A11yAnnouncer", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useAnnouncer: vi.fn(() => ({
      announce: mockAnnounce,
    })),
  };
});

// Mock useKeepAwake
vi.mock("@/hooks/useKeepAwake", () => ({
  useKeepAwake: vi.fn(),
}));

// Mock useSmartSwipe (used by WriteModal)
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock useBackButtonHandler (used by WriteModal)
vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: vi.fn(),
}));

// Mock useQuery for history
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useQuery: vi.fn(() => mockHistoryQueryState),
  };
});

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    history: vi.fn(),
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
}));

// Mock NFC cancel session
vi.mock("@/lib/nfc", () => ({
  cancelSession: vi.fn(),
}));

// Use vi.hoisted for Capacitor mock
const { mockIsNativePlatform } = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn(() => true),
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
    getPlatform: vi.fn(() => "ios"),
  },
}));

// Import the REAL component after mocks are set up
import { Index } from "@/routes/index";

// Helper to provide connection context
function TestWrapper({
  children,
  connectionValue,
}: {
  children: ReactNode;
  connectionValue?: ConnectionContextValue;
}) {
  const defaultConnection: ConnectionContextValue = {
    activeConnection: null,
    isConnected: true,
    hasData: true,
    showConnecting: false,
    showReconnecting: false,
  };

  return (
    <ConnectionContext.Provider value={connectionValue ?? defaultConnection}>
      {children}
    </ConnectionContext.Provider>
  );
}

describe("Index Route Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores to connected state
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      lastToken: { type: "", uid: "", text: "", data: "", scanTime: "" },
      playing: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      },
      writeOpen: false,
      proPurchaseModalOpen: false,
    });

    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      launcherAccess: false,
      nfcAvailable: true,
      cameraAvailable: true,
      preferRemoteWriter: false,
    });

    // Reset mock state
    mockScanOperationsState.scanSession = false;
    mockScanOperationsState.scanStatus = ScanResult.Default;
    mockScanOperationsState.handleScanButton.mockClear();
    mockScanOperationsState.handleCameraScan.mockClear();
    mockScanOperationsState.handleStopConfirm.mockClear();

    mockNfcWriterState.status = null;
    mockNfcWriterState.writing = false;
    mockNfcWriterState.end.mockClear();

    mockHistoryQueryState.data = undefined;
    mockHistoryQueryState.refetch.mockClear();

    // Reset pro purchase mock state
    mockProPurchaseState.proAccess = false;
    mockProPurchaseState.proPurchaseModalOpen = false;
    mockSetProPurchaseModalOpen.mockClear();

    // Reset Capacitor mock
    mockIsNativePlatform.mockReturnValue(true);

    // Reset announcer mock
    mockAnnounce.mockClear();

    localStorage.setItem("deviceAddress", "192.168.1.100");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("Page Structure", () => {
    it("should render the home page with Zaparoo heading", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("heading", { name: "Zaparoo" }),
      ).toBeInTheDocument();
    });

    it("should render the Zaparoo logo", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByAltText("Zaparoo logo")).toBeInTheDocument();
    });

    it("should render history toggle button", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /scan.historyTitle/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Scan Controls", () => {
    it("should render scan button when NFC is available", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /spinner.pressToScan/i }),
      ).toBeInTheDocument();
    });

    it("should not render scan button when NFC is not available", () => {
      usePreferencesStore.setState({ nfcAvailable: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.queryByRole("button", { name: /spinner.pressToScan/i }),
      ).not.toBeInTheDocument();
    });

    it("should render camera button when camera is available", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /scan.cameraMode/i }),
      ).toBeInTheDocument();
    });

    it("should not render camera button when camera is not available", () => {
      usePreferencesStore.setState({ cameraAvailable: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.queryByRole("button", { name: /scan.cameraMode/i }),
      ).not.toBeInTheDocument();
    });

    it("should call handleScanButton when scan button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const scanButton = screen.getByRole("button", {
        name: /spinner.pressToScan/i,
      });
      await user.click(scanButton);

      expect(mockScanOperationsState.handleScanButton).toHaveBeenCalledTimes(1);
    });

    it("should call handleCameraScan when camera button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const cameraButton = screen.getByRole("button", {
        name: /scan.cameraMode/i,
      });
      await user.click(cameraButton);

      expect(mockScanOperationsState.handleCameraScan).toHaveBeenCalledTimes(1);
    });
  });

  describe("Connection Status", () => {
    it("should show connected status", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    });

    it("should show device address when connected", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // The address is passed via translation interpolation - look for the key
      // which contains the IP (scan.connectedSub with ip param)
      expect(screen.getByText(/scan.connectedSub/)).toBeInTheDocument();
    });

    it("should show disconnected status when not connected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      const disconnectedContext: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <TestWrapper connectionValue={disconnectedContext}>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("settings.notConnected")).toBeInTheDocument();
    });
  });

  describe("Last Scanned Info", () => {
    it("should show heading and dash placeholders when no token scanned", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.lastScannedHeading")).toBeInTheDocument();
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("should show token info when last token exists in store", () => {
      useStatusStore.setState({
        lastToken: {
          type: "ntag215",
          uid: "abc123def456ab",
          text: "Super Mario Bros",
          data: "",
          scanTime: new Date().toISOString(),
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
      expect(screen.getByText(/abc123def456ab/)).toBeInTheDocument();
    });

    it("should update when lastToken store changes", () => {
      const { rerender } = render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Initially shows dash placeholders
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);

      // Update store
      act(() => {
        useStatusStore.getState().setLastToken({
          type: "ntag215",
          uid: "newtoken12345a",
          text: "Zelda",
          data: "",
          scanTime: new Date().toISOString(),
        });
      });

      // Re-render to pick up state change
      rerender(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText(/Zelda/)).toBeInTheDocument();
    });
  });

  describe("Now Playing Info", () => {
    it("should show heading and dash placeholders when nothing is playing", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.nowPlayingHeading")).toBeInTheDocument();
    });

    it("should show media info when something is playing", () => {
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "Nintendo Entertainment System",
          mediaName: "Super Mario Bros",
          mediaPath: "/games/smb.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
      expect(
        screen.getByText(/Nintendo Entertainment System/),
      ).toBeInTheDocument();
    });

    it("should show stop button when media is playing", () => {
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /scan.stopPlayingButton/i }),
      ).toBeInTheDocument();
    });

    it("should disable stop button when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      expect(stopButton).toBeDisabled();
    });
  });

  describe("History Modal", () => {
    it("should visually disable history button when disconnected", () => {
      useStatusStore.setState({ connected: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      // ToggleChip uses CSS classes for disabled state, not the disabled attribute
      expect(historyButton).toHaveClass("text-foreground-disabled");
    });

    it("should open history modal when history button is clicked", async () => {
      const user = userEvent.setup();
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      await user.click(historyButton);

      // Modal should be open - look for the dialog
      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-hidden", "false");
      });
    });

    it("should refetch history when modal opens", async () => {
      const user = userEvent.setup();
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      await user.click(historyButton);

      await waitFor(() => {
        expect(mockHistoryQueryState.refetch).toHaveBeenCalled();
      });
    });
  });

  describe("Stop Confirm Modal", () => {
    it("should open stop confirm modal when stop button is clicked", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      await user.click(stopButton);

      // Stop confirm modal should be open
      await waitFor(() => {
        expect(screen.getByText("stopPlaying")).toBeInTheDocument();
      });
    });

    it("should call handleStopConfirm when confirmed", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Open stop confirm modal
      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      await user.click(stopButton);

      // Click confirm
      await waitFor(() => {
        expect(screen.getByText("stopPlaying")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /yes/i });
      await user.click(confirmButton);

      expect(mockScanOperationsState.handleStopConfirm).toHaveBeenCalledTimes(
        1,
      );
    });

    it("should close stop confirm modal when cancelled", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Open stop confirm modal
      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      await user.click(stopButton);

      await waitFor(() => {
        expect(screen.getByText("stopPlaying")).toBeInTheDocument();
      });

      // Click cancel
      const cancelButton = screen.getByRole("button", { name: /nav.cancel/i });
      await user.click(cancelButton);

      // Modal should be closed - the stopPlaying text should no longer be visible
      // (SlideModal animates off-screen but stays in DOM)
      await waitFor(() => {
        // Find the stop confirm modal's dialog by looking for its content
        const dialogs = screen.getAllByRole("dialog", { hidden: true });
        const stopConfirmDialog = dialogs.find((d) =>
          d.textContent?.includes("stopPlaying"),
        );
        expect(stopConfirmDialog).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  describe("Write Modal", () => {
    it("should render write modal when writeOpen is true", () => {
      useStatusStore.setState({ writeOpen: true });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // WriteModal renders a dialog with aria-label when open
      const writeDialog = screen.getByRole("dialog", {
        name: /spinner.holdTag/i,
      });
      expect(writeDialog).toBeInTheDocument();
    });

    it("should close write modal and call nfcWriter.end when close is triggered", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({ writeOpen: true });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Find and click the cancel button in the write modal
      const cancelButton = screen.getByRole("button", { name: /nav.cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(mockNfcWriterState.end).toHaveBeenCalled();
      });
    });

    it("should auto-close write modal when nfcWriter status changes", () => {
      useStatusStore.setState({ writeOpen: true });

      const { rerender } = render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Simulate nfcWriter status change
      mockNfcWriterState.status = "success";

      rerender(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // The effect should have closed the modal
      expect(useStatusStore.getState().writeOpen).toBe(false);
    });
  });

  describe("Scan Status Display", () => {
    it("should show scanning status when scan session is active", () => {
      mockScanOperationsState.scanSession = true;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.statusScanning")).toBeInTheDocument();
    });

    it("should show success status after successful scan", () => {
      mockScanOperationsState.scanStatus = ScanResult.Success;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.statusSuccess")).toBeInTheDocument();
    });

    it("should show error status after failed scan", () => {
      mockScanOperationsState.scanStatus = ScanResult.Error;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.statusError")).toBeInTheDocument();
    });
  });

  describe("Store State Integration", () => {
    it("should reflect playing state changes from store", () => {
      const { rerender } = render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Initially no media playing
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);

      // Update store
      act(() => {
        useStatusStore.getState().setPlaying({
          systemId: "snes",
          systemName: "Super Nintendo",
          mediaName: "Donkey Kong Country",
          mediaPath: "/games/dkc.sfc",
        });
      });

      rerender(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText(/Donkey Kong Country/)).toBeInTheDocument();
      expect(screen.getByText(/Super Nintendo/)).toBeInTheDocument();
    });

    it("should reflect connection state changes from store", () => {
      const { rerender } = render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Initially connected
      expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();

      // Update store to disconnected
      act(() => {
        useStatusStore.setState({
          connected: false,
          connectionState: ConnectionState.DISCONNECTED,
        });
      });

      const disconnectedContext: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
      };

      rerender(
        <TestWrapper connectionValue={disconnectedContext}>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("settings.notConnected")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have sr-only heading for screen readers", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const heading = screen.getByRole("heading", { name: "Zaparoo" });
      expect(heading).toHaveClass("sr-only");
    });

    it("should have accessible history button with aria-label", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      expect(historyButton).toHaveAttribute("aria-label");
    });
  });

  describe("A11y Page Announcements", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should not announce on non-native platform", async () => {
      mockIsNativePlatform.mockReturnValue(false);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should not call announce on non-native platform
      expect(mockAnnounce).not.toHaveBeenCalled();
    });

    it("should announce NFC scan instruction when NFC is available", async () => {
      usePreferencesStore.setState({
        nfcAvailable: true,
        cameraAvailable: true,
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should announce NFC instruction
      expect(mockAnnounce).toHaveBeenCalledWith("spinner.pressToScan");
    });

    it("should announce camera option when NFC is not available but camera is", async () => {
      usePreferencesStore.setState({
        nfcAvailable: false,
        cameraAvailable: true,
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should announce camera option
      expect(mockAnnounce).toHaveBeenCalledWith("scan.cameraAvailable");
    });

    it("should announce page name when neither NFC nor camera is available", async () => {
      usePreferencesStore.setState({
        nfcAvailable: false,
        cameraAvailable: false,
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should announce page name
      expect(mockAnnounce).toHaveBeenCalledWith("nav.index");
    });

    it("should only announce once on mount", async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(mockAnnounce).toHaveBeenCalledTimes(1);

      // Advance more time - should not announce again
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockAnnounce).toHaveBeenCalledTimes(1);
    });
  });

  describe("Modal Timing", () => {
    it("should close pro purchase modal when history is clicked while it's open", async () => {
      const user = userEvent.setup();
      mockProPurchaseState.proPurchaseModalOpen = true;
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });

      // Click history button while pro modal is open
      await user.click(historyButton);

      // Should close pro purchase modal first
      expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(false);
    });

    it("should open history modal normally when pro purchase modal is not open", async () => {
      const user = userEvent.setup();
      mockProPurchaseState.proPurchaseModalOpen = false;
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });

      // Click history button
      await user.click(historyButton);

      // Should open history modal
      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-hidden", "false");
      });

      // Should not have interacted with pro purchase modal at all
      expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled();
    });
  });
});

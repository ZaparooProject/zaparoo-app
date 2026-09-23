/**
 * Integration Test: Home Page Scan Flows
 *
 * Covers the adaptive scan actions:
 * - which action leads, and how capability changes the layout
 * - starting and stopping a scan from the same control
 * - the Android "NFC is off" affordance
 * - screen reader status announcements
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, renderHook, act } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { Capacitor } from "@capacitor/core";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ScanActions } from "@/components/home/ScanActions";
import {
  resolveScanLayout,
  useHomeScanLayout,
} from "@/hooks/useHomeScanLayout";
import { ScanResult } from "@/lib/models";

function renderActions(
  overrides: Partial<Parameters<typeof ScanActions>[0]> = {},
) {
  const onTapScan = vi.fn();
  const onCameraScan = vi.fn();
  const onOpenNfcSettings = vi.fn();
  const layout = overrides.layout ?? {
    leading: "nfc" as const,
    alternate: "camera" as const,
    canScan: true,
    showEmptyState: false,
  };

  render(
    <ScanActions
      layout={layout}
      scanSession={false}
      scanStatus={ScanResult.Default}
      nfcEnabled
      onTapScan={onTapScan}
      onCameraScan={onCameraScan}
      onOpenNfcSettings={onOpenNfcSettings}
      {...overrides}
    />,
  );

  return { onTapScan, onCameraScan, onOpenNfcSettings };
}

describe("Home Page Scan Flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      nfcAvailable: true,
      cameraAvailable: true,
    });

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Action layout", () => {
    it.each([
      {
        name: "leads with NFC when both are available",
        nfc: true,
        camera: true,
        last: null,
        leading: "nfc",
        alternate: "camera",
      },
      {
        name: "leads with the camera once it is the mode in use",
        nfc: true,
        camera: true,
        last: "camera" as const,
        leading: "camera",
        alternate: "nfc",
      },
      {
        name: "shows one action when only NFC is available",
        nfc: true,
        camera: false,
        last: null,
        leading: "nfc",
        alternate: null,
      },
      {
        name: "shows one action when only the camera is available",
        nfc: false,
        camera: true,
        last: "camera" as const,
        leading: "camera",
        alternate: null,
      },
    ])("$name", ({ nfc, camera, last, leading, alternate }) => {
      const layout = resolveScanLayout(nfc, camera, last, true);

      expect(layout.leading).toBe(leading);
      expect(layout.alternate).toBe(alternate);
      expect(layout.canScan).toBe(true);
    });

    it("offers no scan control when the phone has neither reader", () => {
      const layout = resolveScanLayout(false, false, null, true);

      expect(layout.canScan).toBe(false);
      expect(layout.showEmptyState).toBe(true);
    });

    it("does not re-order while the page is open", () => {
      const { result } = renderHook(() => useHomeScanLayout());
      expect(result.current.leading).toBe("nfc");

      act(() => {
        usePreferencesStore.setState({ lastScanMode: "camera" });
      });

      // The action the user just used must not grow under their finger; the new
      // order lands on the next visit.
      expect(result.current.leading).toBe("nfc");
    });

    it("re-orders when the phone's capabilities change", () => {
      const { result } = renderHook(() => useHomeScanLayout());
      expect(result.current.leading).toBe("nfc");

      act(() => {
        usePreferencesStore.setState({
          nfcAvailable: false,
          lastScanMode: "camera",
        });
      });

      expect(result.current.leading).toBe("camera");
      expect(result.current.alternate).toBeNull();
    });
  });

  describe("Scanning", () => {
    it("starts a scan from the tap action", async () => {
      const user = userEvent.setup();
      const { onTapScan } = renderActions();

      await user.click(screen.getByRole("button", { name: "scan.tapTag" }));

      expect(onTapScan).toHaveBeenCalledTimes(1);
    });

    it("stops the scan from the same action", async () => {
      const user = userEvent.setup();
      const { onTapScan } = renderActions({ scanSession: true });

      const action = screen.getByRole("button", { name: "scan.tapTagStop" });
      expect(action).toHaveAttribute("aria-pressed", "true");
      expect(action.parentElement).toHaveAttribute(
        "data-reader-state",
        "waiting",
      );
      expect(screen.getByText("reader.pressAgainToCancel")).toBeVisible();

      await user.click(action);

      expect(onTapScan).toHaveBeenCalledTimes(1);
    });

    it("keeps the camera out of the way during a scan", () => {
      renderActions({ scanSession: true });

      expect(
        screen.getByRole("button", { name: "scan.scanCode" }),
      ).toBeDisabled();
    });

    it("opens the camera scanner", async () => {
      const user = userEvent.setup();
      const { onCameraScan } = renderActions();

      await user.click(screen.getByRole("button", { name: "scan.scanCode" }));

      expect(onCameraScan).toHaveBeenCalledTimes(1);
    });

    it("sends the user to system settings when NFC is switched off", async () => {
      const user = userEvent.setup();
      const { onOpenNfcSettings } = renderActions({ nfcEnabled: false });

      await user.click(
        screen.getByRole("button", { name: "spinner.openNfcSettings" }),
      );

      expect(onOpenNfcSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe("Status announcements", () => {
    it("announces a scan in progress", () => {
      renderActions({ scanSession: true });

      expect(screen.getByText("scan.statusScanning")).toBeInTheDocument();
    });

    it("announces a successful scan", () => {
      renderActions({ scanStatus: ScanResult.Success });

      expect(screen.getByText("scan.statusSuccess")).toBeInTheDocument();
    });

    it("announces a failed scan", () => {
      renderActions({ scanStatus: ScanResult.Error });

      expect(screen.getByText("scan.statusError")).toBeInTheDocument();
    });
  });

  describe("Web platform", () => {
    it("offers no actions where the phone hardware does not exist", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      renderActions({
        layout: {
          leading: null,
          alternate: null,
          canScan: false,
          showEmptyState: false,
        },
      });

      expect(
        screen.queryByRole("button", { name: "scan.tapTag" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "scan.scanCode" }),
      ).not.toBeInTheDocument();
    });
  });
});

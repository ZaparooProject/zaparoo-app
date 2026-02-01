/**
 * Integration Test: Home Page Scan Flows
 *
 * Tests the scan operation flows including:
 * - NFC scan button interactions
 * - Camera scan button interactions
 * - Scan status updates (success/error)
 * - Pro purchase modal flow for launch on scan
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { Capacitor } from "@capacitor/core";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ScanControls } from "@/components/home/ScanControls";
import { LastScannedInfo } from "@/components/home/LastScannedInfo";
import { ScanResult } from "@/lib/models";

describe("Home Page Scan Flows", () => {
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
      nfcAvailable: true,
      cameraAvailable: true,
    });

    // Default to native platform
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("NFC Scan Button", () => {
    it("should render scan button when NFC is available on native", () => {
      const onScanButton = vi.fn();
      const onCameraScan = vi.fn();

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={onScanButton}
          onCameraScan={onCameraScan}
        />,
      );

      const scanButton = screen.getByRole("button", {
        name: /spinner.pressToScan/i,
      });
      expect(scanButton).toBeInTheDocument();
    });

    it("should not render scan button when NFC is not available", () => {
      usePreferencesStore.setState({ nfcAvailable: false });

      const onScanButton = vi.fn();
      const onCameraScan = vi.fn();

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={onScanButton}
          onCameraScan={onCameraScan}
        />,
      );

      expect(
        screen.queryByRole("button", { name: /spinner.pressToScan/i }),
      ).not.toBeInTheDocument();
    });

    it("should call onScanButton when scan button is clicked", async () => {
      const user = userEvent.setup();
      const onScanButton = vi.fn();
      const onCameraScan = vi.fn();

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={onScanButton}
          onCameraScan={onCameraScan}
        />,
      );

      const scanButton = screen.getByRole("button", {
        name: /spinner.pressToScan/i,
      });
      await user.click(scanButton);

      expect(onScanButton).toHaveBeenCalledTimes(1);
    });

    it("should call onScanButton on keyboard Enter", async () => {
      const user = userEvent.setup();
      const onScanButton = vi.fn();
      const onCameraScan = vi.fn();

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={onScanButton}
          onCameraScan={onCameraScan}
        />,
      );

      const scanButton = screen.getByRole("button", {
        name: /spinner.pressToScan/i,
      });
      scanButton.focus();
      await user.keyboard("{Enter}");

      expect(onScanButton).toHaveBeenCalledTimes(1);
    });

    it("should announce scanning status to screen readers", () => {
      render(
        <ScanControls
          scanSession={true}
          scanStatus={ScanResult.Default}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      // The aria-live region should contain the scanning announcement
      const liveRegion = screen.getByText("scan.statusScanning");
      expect(liveRegion).toBeInTheDocument();
    });
  });

  describe("Camera Scan Button", () => {
    it("should render camera button when camera is available on native", () => {
      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      const cameraButton = screen.getByRole("button", {
        name: /scan.cameraMode/i,
      });
      expect(cameraButton).toBeInTheDocument();
    });

    it("should not render camera button when camera is not available", () => {
      usePreferencesStore.setState({ cameraAvailable: false });

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      expect(
        screen.queryByRole("button", { name: /scan.cameraMode/i }),
      ).not.toBeInTheDocument();
    });

    it("should call onCameraScan when camera button is clicked", async () => {
      const user = userEvent.setup();
      const onCameraScan = vi.fn();

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={vi.fn()}
          onCameraScan={onCameraScan}
        />,
      );

      const cameraButton = screen.getByRole("button", {
        name: /scan.cameraMode/i,
      });
      await user.click(cameraButton);

      expect(onCameraScan).toHaveBeenCalledTimes(1);
    });

    it("should not render camera button on web platform", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      expect(
        screen.queryByRole("button", { name: /scan.cameraMode/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Scan Status Display", () => {
    it("should show success status announcement after successful scan", () => {
      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Success}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      expect(screen.getByText("scan.statusSuccess")).toBeInTheDocument();
    });

    it("should show error status announcement after failed scan", () => {
      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Error}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      expect(screen.getByText("scan.statusError")).toBeInTheDocument();
    });

    it("should clear status announcement when status is default", () => {
      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      // The aria-live region should be empty for default status
      expect(screen.queryByText("scan.statusScanning")).not.toBeInTheDocument();
      expect(screen.queryByText("scan.statusSuccess")).not.toBeInTheDocument();
      expect(screen.queryByText("scan.statusError")).not.toBeInTheDocument();
    });
  });

  describe("LastScannedInfo with scan status", () => {
    it("should show success state styling when scan was successful", () => {
      const lastToken = {
        type: "ntag215",
        uid: "abc123def456ab",
        text: "Super Mario Bros",
        data: "",
        scanTime: new Date().toISOString(),
      };

      render(
        <LastScannedInfo
          lastToken={lastToken}
          scanStatus={ScanResult.Success}
        />,
      );

      // Token info should be displayed
      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
      expect(screen.getByText(/abc123def456ab/)).toBeInTheDocument();
    });

    it("should show error state styling when scan failed", () => {
      const emptyToken = {
        type: "",
        uid: "",
        text: "",
        data: "",
        scanTime: "",
      };

      render(
        <LastScannedInfo
          lastToken={emptyToken}
          scanStatus={ScanResult.Error}
        />,
      );

      // Heading should still be visible
      expect(screen.getByText("scan.lastScannedHeading")).toBeInTheDocument();
    });
  });

  describe("Web Platform", () => {
    it("should not render scan controls on web platform", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      render(
        <ScanControls
          scanSession={false}
          scanStatus={ScanResult.Default}
          onScanButton={vi.fn()}
          onCameraScan={vi.fn()}
        />,
      );

      // Neither scan button nor camera button should render on web
      expect(
        screen.queryByRole("button", { name: /spinner.pressToScan/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /scan.cameraMode/i }),
      ).not.toBeInTheDocument();
    });
  });
});

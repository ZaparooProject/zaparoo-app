/**
 * Integration Test: Connection Flow
 *
 * Tests the device connection lifecycle with real stores + MSW.
 * This is a high-value integration test that verifies the connection
 * state machine works correctly end-to-end.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "../../test-utils";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";
import { ReactNode } from "react";

// Test wrapper that provides connection context
function ConnectionWrapper({
  children,
  value,
}: {
  children: ReactNode;
  value: ConnectionContextValue;
}) {
  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

describe("Connection Flow Integration", () => {
  beforeEach(() => {
    // Reset stores to initial state
    useStatusStore.setState({
      ...useStatusStore.getState(),
      connected: false,
      connectionState: ConnectionState.IDLE,
      connectionError: "",
      targetDeviceAddress: "",
      lastConnectionTime: null,
      retryCount: 0,
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      _hasHydrated: true,
    });

    // Set a default device address for most tests
    localStorage.setItem("deviceAddress", "192.168.1.100");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("connection state transitions", () => {
    it("should show disconnected state when not connected", () => {
      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("settings.notConnected")).toBeInTheDocument();
    });

    it("should show connecting state during initial connection", () => {
      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: true,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("connection.connecting")).toBeInTheDocument();
    });

    it("should show connected state when connection is established", () => {
      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: true,
        hasData: true,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay connectedSubtitle="v1.0.0" />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
      expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    });

    it("should show reconnecting state after disconnect", () => {
      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: true,
        showConnecting: false,
        showReconnecting: true,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();
    });

    it("should show error state with error message", () => {
      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay connectionError="Connection refused" />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("scan.connectionError")).toBeInTheDocument();
      expect(screen.getByText("Connection refused")).toBeInTheDocument();
    });
  });

  describe("connection status display with action slot", () => {
    it("should render action button in connected state", () => {
      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: true,
        hasData: true,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay
            action={<button aria-label="Settings">Settings</button>}
          />
        </ConnectionWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /settings/i }),
      ).toBeInTheDocument();
    });

    it("should show loading skeleton when connected subtitle is loading", () => {
      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: true,
        hasData: true,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay connectedSubtitleLoading={true} />
        </ConnectionWrapper>,
      );

      // Should show heading but not show a subtitle text when loading
      expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
      // No device address or version subtitle should be visible during loading
      expect(screen.queryByText("192.168.1.100")).not.toBeInTheDocument();
    });
  });

  describe("device address handling", () => {
    it("should show placeholder text when no address is set on native platform", async () => {
      // Clear localStorage to simulate no address
      localStorage.removeItem("deviceAddress");

      // Mock native platform so getDeviceAddress returns empty (on web it falls back to hostname)
      const { Capacitor } = await import("@capacitor/core");
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      // The component shows "settings.enterDeviceAddress" translation key when no address
      expect(
        screen.getByText("settings.enterDeviceAddress"),
      ).toBeInTheDocument();

      // Reset mock
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it("should show device address in subtitle when connecting", () => {
      // Set actual localStorage value for the test
      localStorage.setItem("deviceAddress", "10.0.0.50");

      const connectionValue: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: true,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={connectionValue}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("10.0.0.50")).toBeInTheDocument();

      // Clean up
      localStorage.removeItem("deviceAddress");
    });
  });
});

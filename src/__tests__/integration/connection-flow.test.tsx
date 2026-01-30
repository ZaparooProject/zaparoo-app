/**
 * Integration Test: Connection Flow
 *
 * Tests the device connection lifecycle with real stores + MSW.
 * This is a high-value integration test that verifies the connection
 * state machine works correctly end-to-end.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, act } from "../../test-utils";
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

  describe("store state management", () => {
    it("should update connected state through store actions", () => {
      // Initial state
      expect(useStatusStore.getState().connected).toBe(false);
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.IDLE,
      );

      // Simulate connection establishing
      act(() => {
        useStatusStore
          .getState()
          .setConnectionState(ConnectionState.CONNECTING);
      });
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.CONNECTING,
      );
      expect(useStatusStore.getState().connected).toBe(false);

      // Simulate connection established
      act(() => {
        useStatusStore.getState().setConnectionState(ConnectionState.CONNECTED);
      });
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.CONNECTED,
      );
      expect(useStatusStore.getState().connected).toBe(true);

      // Simulate reconnecting
      act(() => {
        useStatusStore
          .getState()
          .setConnectionState(ConnectionState.RECONNECTING);
      });
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.RECONNECTING,
      );
      // RECONNECTING is treated as "connected enough" to show UI
      expect(useStatusStore.getState().connected).toBe(true);

      // Simulate disconnect
      act(() => {
        useStatusStore
          .getState()
          .setConnectionState(ConnectionState.DISCONNECTED);
      });
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.DISCONNECTED,
      );
      expect(useStatusStore.getState().connected).toBe(false);
    });

    it("should handle connection errors", () => {
      act(() => {
        useStatusStore.getState().setConnectionError("Network unreachable");
      });
      expect(useStatusStore.getState().connectionError).toBe(
        "Network unreachable",
      );

      // Clear error on successful connection
      act(() => {
        useStatusStore.getState().setConnectionError("");
        useStatusStore.getState().setConnectionState(ConnectionState.CONNECTED);
      });
      expect(useStatusStore.getState().connectionError).toBe("");
      expect(useStatusStore.getState().connected).toBe(true);
    });

    it("should track retry count", () => {
      expect(useStatusStore.getState().retryCount).toBe(0);

      act(() => {
        useStatusStore.getState().retryConnection();
      });
      expect(useStatusStore.getState().retryCount).toBe(1);

      act(() => {
        useStatusStore.getState().retryConnection();
      });
      expect(useStatusStore.getState().retryCount).toBe(2);
    });

    it("should reset connection state completely", () => {
      // Set up some state
      act(() => {
        useStatusStore.getState().setConnectionState(ConnectionState.CONNECTED);
        useStatusStore.getState().setConnectionError("Previous error");
        useStatusStore.getState().setLastToken({
          type: "ntag215",
          uid: "abc123def456ab",
          text: "test",
          data: "",
          scanTime: new Date().toISOString(),
        });
      });

      // Reset
      act(() => {
        useStatusStore.getState().resetConnectionState();
      });

      // Verify reset
      expect(useStatusStore.getState().connected).toBe(false);
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.IDLE,
      );
      expect(useStatusStore.getState().connectionError).toBe("");
      expect(useStatusStore.getState().lastToken.uid).toBe("");
      expect(useStatusStore.getState().retryCount).toBe(0);
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

      // Should show heading but skeleton for subtitle
      expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
      // The skeleton is rendered as a div with animate-pulse class
      const container = document.querySelector(".animate-pulse");
      expect(container).toBeInTheDocument();
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

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
      // Seed encryptionState as plaintext so connected-state assertions don't
      // hit the verifying UI gate (encryptionState === "unknown" -> connecting).
      encryptionState: "plaintext",
      pairingRequired: false,
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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
        openPairingModal: () => {},
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

  // Regression test for the green-flash + stuck-reconnecting bug.
  // Drives the full pair-then-reconnect lifecycle by progressing context +
  // store state through each phase the consumer would see in production.
  describe("encrypted device pair-then-reconnect lifecycle", () => {
    it("should never show green Connected during initial encryption verification", () => {
      // Phase 1: WebSocket has just opened, transport reports connected, but
      // the consumer has not yet learned the encryption mode.
      useStatusStore.setState({
        encryptionState: "unknown",
        pairingRequired: false,
      });

      const value: ConnectionContextValue = {
        activeConnection: null,
        isConnected: true,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
        openPairingModal: () => {},
      };

      const { rerender } = render(
        <ConnectionWrapper value={value}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      // Gate must hold UI in "Connecting" — no green flash.
      expect(screen.getByText("connection.connecting")).toBeInTheDocument();
      expect(
        screen.queryByText("scan.connectedHeading"),
      ).not.toBeInTheDocument();

      // Phase 2: server replied with -32002. ConnectionProvider sets
      // encryptionState=plaintext + pairingRequired=true, then transport
      // disconnects.
      useStatusStore.setState({
        encryptionState: "plaintext",
        pairingRequired: true,
      });

      rerender(
        <ConnectionWrapper
          value={{
            ...value,
            isConnected: false,
            showReconnecting: false,
          }}
        >
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(
        screen.getByText("connection.pairingRequired"),
      ).toBeInTheDocument();

      // Phase 3: pairing succeeds. ConnectionProvider's onConnectionChange
      // resets encryptionState=unknown + pairingRequired=false when transport
      // transitions to "connecting" (the start of the post-pair reconnect).
      // Without this reset the UI would still show "Pairing required" and
      // never resolve. Either showReconnecting or showConnecting can be true
      // here depending on transport history; the gate handles both.
      useStatusStore.setState({
        encryptionState: "unknown",
        pairingRequired: false,
      });

      rerender(
        <ConnectionWrapper
          value={{
            ...value,
            isConnected: false,
            showReconnecting: true,
          }}
        >
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();

      // Phase 4: WebSocket reopens with creds, transport reports connected,
      // encrypted handshake still in flight.
      rerender(
        <ConnectionWrapper
          value={{
            ...value,
            isConnected: true,
            showReconnecting: true,
          }}
        >
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      // Gate keeps UI in "Reconnecting" — still no green flash.
      expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();
      expect(
        screen.queryByText("scan.connectedHeading"),
      ).not.toBeInTheDocument();

      // Phase 5: encrypted handshake confirmed. ConnectionProvider sets
      // encryptionState=encrypted + pairingRequired=false.
      useStatusStore.setState({
        encryptionState: "encrypted",
        pairingRequired: false,
      });

      rerender(
        <ConnectionWrapper
          value={{
            ...value,
            isConnected: true,
            hasData: true,
            showReconnecting: false,
          }}
        >
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
      expect(screen.getByLabelText("connection.encrypted")).toBeInTheDocument();
    });

    // Regression: a previous fix attempt reset pairingRequired on every
    // "reconnecting" transition, which wiped the signal before the UI could
    // render — leaving the user stuck in "Reconnecting…" with no Pair button.
    // The fix moved the reset to fire only on "connecting", and short-circuited
    // the transport's handleDisconnection on encryptionBlocked so a spurious
    // "reconnecting" event is never emitted in the -32002 flow. This test
    // verifies the consumer-visible behaviour: when -32002 is received and
    // the transport goes straight to disconnected, "Pairing required" shows.
    it("should show Pairing required after -32002 and survive a spurious reconnecting event", () => {
      // Transport went connected → disconnected (no "reconnecting" emitted).
      // ConnectionProvider's onEncryptionRequired set the signals before the
      // close fired, so the store now reflects the pair-required state.
      useStatusStore.setState({
        encryptionState: "plaintext",
        pairingRequired: true,
      });

      const value: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
        openPairingModal: () => {},
      };

      const { rerender } = render(
        <ConnectionWrapper value={value}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(
        screen.getByText("connection.pairingRequired"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("connection.reconnecting"),
      ).not.toBeInTheDocument();

      // Even if a future regression caused the transport to emit a transient
      // "reconnecting" event, deriveUIState's precedence (pairingRequired
      // outranks reconnecting) must keep the Pair UI visible.
      rerender(
        <ConnectionWrapper value={{ ...value, showReconnecting: true }}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(
        screen.getByText("connection.pairingRequired"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("connection.reconnecting"),
      ).not.toBeInTheDocument();
    });
  });
});

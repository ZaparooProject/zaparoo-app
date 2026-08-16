import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";
import { useStatusStore } from "@/lib/store";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { ReactNode } from "react";

function wrap(
  children: ReactNode,
  value: Partial<ConnectionContextValue> = {},
) {
  const full: ConnectionContextValue = {
    activeConnection: null,
    isConnected: false,
    hasData: false,
    showConnecting: false,
    showReconnecting: false,
    openPairingModal: () => {},
    ...value,
  };
  return (
    <ConnectionContext.Provider value={full}>
      {children}
    </ConnectionContext.Provider>
  );
}

describe("ConnectionStatusDisplay encryption gate", () => {
  beforeEach(async () => {
    useStatusStore.setState({
      encryptionState: "unknown",
      pairingRequired: false,
    });
    // Without a saved device the component reports "disconnected" regardless of
    // the connection context, so every state below needs one selected.
    await seedActiveDevice({ address: "192.168.1.100" });
  });

  it("should show Connecting when isConnected=true but encryptionState is unknown", () => {
    render(wrap(<ConnectionStatusDisplay />, { isConnected: true }));

    expect(screen.getByText("connection.connecting")).toBeInTheDocument();
    expect(screen.queryByText("scan.connectedHeading")).not.toBeInTheDocument();
  });

  it("should show Reconnecting when isConnected=true, showReconnecting=true and encryptionState is unknown", () => {
    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: true,
        showReconnecting: true,
      }),
    );

    expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();
    expect(screen.queryByText("scan.connectedHeading")).not.toBeInTheDocument();
  });

  it("should show Connected when isConnected=true and encryptionState=plaintext", () => {
    useStatusStore.setState({ encryptionState: "plaintext" });

    render(wrap(<ConnectionStatusDisplay />, { isConnected: true }));

    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByLabelText("connection.unencrypted")).toBeInTheDocument();
  });

  it("should show Connected with lock icon when encryptionState=encrypted", () => {
    useStatusStore.setState({ encryptionState: "encrypted" });

    render(wrap(<ConnectionStatusDisplay />, { isConnected: true }));

    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByLabelText("connection.encrypted")).toBeInTheDocument();
  });

  it("should show Pairing required when not connected and pairingRequired=true", () => {
    useStatusStore.setState({ pairingRequired: true });

    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: false,
        showReconnecting: true,
      }),
    );

    expect(screen.getByText("connection.pairingRequired")).toBeInTheDocument();
  });
});

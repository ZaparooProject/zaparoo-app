import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "../../../test-utils";
import { ConnectionStatusBar } from "@/components/ConnectionStatusBar";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "@/hooks/useConnection";
import { useStatusStore } from "@/lib/store";

const mockUseLocation = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    className,
  }: React.ComponentProps<"a"> & { to: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useLocation: () => mockUseLocation(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function connectionValue(
  overrides: Partial<ConnectionContextValue> = {},
): ConnectionContextValue {
  return {
    activeConnection: null,
    isConnected: false,
    hasData: false,
    showConnecting: true,
    showReconnecting: false,
    openPairingModal: () => {},
    ...overrides,
  };
}

function Wrapper(props: {
  children: ReactNode;
  value: ConnectionContextValue;
}) {
  return (
    <ConnectionContext.Provider value={props.value}>
      {props.children}
    </ConnectionContext.Provider>
  );
}

describe("ConnectionStatusBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    mockUseLocation.mockReturnValue({ pathname: "/library" });
    useStatusStore.setState({
      networkAvailable: true,
      pairingRequired: false,
      connectionIssueStartedAt: Date.now(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps sub-second reconnects silent", () => {
    render(
      <Wrapper value={connectionValue()}>
        <ConnectionStatusBar />
      </Wrapper>,
    );

    expect(
      screen.queryByText("connection.connectingToCore"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("connection-status-announcement"),
    ).toHaveTextContent("");
  });

  it("shows neutral connecting status after one second", () => {
    render(
      <Wrapper value={connectionValue()}>
        <ConnectionStatusBar />
      </Wrapper>,
    );

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getAllByText("connection.connectingToCore")).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows reconnecting when cached device data exists", () => {
    render(
      <Wrapper
        value={connectionValue({
          hasData: true,
          showConnecting: false,
          showReconnecting: true,
        })}
      >
        <ConnectionStatusBar />
      </Wrapper>,
    );

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getAllByText("connection.reconnectingToCore")).toHaveLength(
      2,
    );
  });

  it("escalates to persistent Core unavailable status after ten seconds", () => {
    render(
      <Wrapper value={connectionValue()}>
        <ConnectionStatusBar />
      </Wrapper>,
    );

    act(() => vi.advanceTimersByTime(10_000));

    expect(screen.getAllByText("connection.coreUnavailable")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "nav.settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("prioritizes explicit network unavailability", () => {
    useStatusStore.setState({ networkAvailable: false });

    render(
      <Wrapper value={connectionValue()}>
        <ConnectionStatusBar />
      </Wrapper>,
    );

    expect(screen.getAllByText("connection.networkUnavailable")).toHaveLength(
      2,
    );
  });

  it("suppresses generic status while pairing requires action", () => {
    useStatusStore.setState({ pairingRequired: true });

    render(
      <Wrapper value={connectionValue()}>
        <ConnectionStatusBar />
      </Wrapper>,
    );

    act(() => vi.advanceTimersByTime(10_000));

    expect(
      screen.getByTestId("connection-status-announcement"),
    ).toHaveTextContent("");
    expect(
      screen.queryByText("connection.coreUnavailable"),
    ).not.toBeInTheDocument();
  });

  it("announces one brief recovery only after status was presented", () => {
    const initial = connectionValue();
    const { rerender } = render(
      <Wrapper value={initial}>
        <ConnectionStatusBar />
      </Wrapper>,
    );
    act(() => vi.advanceTimersByTime(1_000));
    act(() => useStatusStore.setState({ connectionIssueStartedAt: null }));

    rerender(
      <Wrapper
        value={connectionValue({
          isConnected: true,
          showConnecting: false,
        })}
      >
        <ConnectionStatusBar />
      </Wrapper>,
    );
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getAllByText("connection.restored")).toHaveLength(2);

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByText("connection.restored")).not.toBeInTheDocument();
  });

  it("does not announce recovery for a hidden quick reconnect", () => {
    const { rerender } = render(
      <Wrapper value={connectionValue()}>
        <ConnectionStatusBar />
      </Wrapper>,
    );
    act(() => useStatusStore.setState({ connectionIssueStartedAt: null }));

    rerender(
      <Wrapper
        value={connectionValue({
          isConnected: true,
          showConnecting: false,
        })}
      >
        <ConnectionStatusBar />
      </Wrapper>,
    );
    act(() => vi.advanceTimersByTime(3_000));

    expect(
      screen.getByTestId("connection-status-announcement"),
    ).toHaveTextContent("");
  });

  it("keeps only the live announcement on contextual-status routes", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings" });

    render(
      <Wrapper value={connectionValue()}>
        <ConnectionStatusBar />
      </Wrapper>,
    );
    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getAllByText("connection.connectingToCore")).toHaveLength(1);
  });
});

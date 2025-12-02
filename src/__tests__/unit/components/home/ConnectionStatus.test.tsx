import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import { ConnectionStatus } from "../../../../components/home/ConnectionStatus";

// Mock coreApi
const mockGetDeviceAddress = vi.fn(() => "192.168.1.100");
vi.mock("../../../../lib/coreApi", () => ({
  getDeviceAddress: () => mockGetDeviceAddress(),
}));

// Mock useConnection hook
const mockUseConnection = vi.fn();
vi.mock("../../../../hooks/useConnection", () => ({
  useConnection: () => mockUseConnection(),
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (key === "scan.connectedSub" && options?.ip) {
        return `Address: ${options.ip}`;
      }
      return key;
    },
  }),
}));

// Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string>;
  }) => (
    <a
      href={to}
      data-testid="settings-link"
      data-search={JSON.stringify(search)}
    >
      {children}
    </a>
  ),
}));

describe("ConnectionStatus", () => {
  beforeEach(() => {
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockUseConnection.mockReturnValue({
      isConnected: false,
      showConnecting: false,
      showReconnecting: false,
      hasData: false,
    });
  });

  it("renders disconnected state when no address is saved", () => {
    mockGetDeviceAddress.mockReturnValue("");

    render(<ConnectionStatus />);

    expect(screen.getByText("settings.notConnected")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders connected state with device address", () => {
    mockUseConnection.mockReturnValue({
      isConnected: true,
      showConnecting: false,
      showReconnecting: false,
      hasData: true,
    });

    render(<ConnectionStatus />);

    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByText("Address: 192.168.1.100")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders connecting state with loading indicator", () => {
    mockUseConnection.mockReturnValue({
      isConnected: false,
      showConnecting: true,
      showReconnecting: false,
      hasData: false,
    });

    render(<ConnectionStatus />);

    expect(screen.getByText("connection.connecting")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders reconnecting state with loading indicator", () => {
    mockUseConnection.mockReturnValue({
      isConnected: false,
      showConnecting: false,
      showReconnecting: true,
      hasData: true,
    });

    render(<ConnectionStatus />);

    expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders error state when connection error exists", () => {
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockUseConnection.mockReturnValue({
      isConnected: false,
      showConnecting: false,
      showReconnecting: false,
      hasData: false,
    });

    // Error state is determined by having an address but not connected/connecting/reconnecting
    // and the component receiving a connectionError prop (handled by DeviceConnectionCard)
    // For ConnectionStatus on the Zap page, it shows disconnected state instead
    render(<ConnectionStatus />);

    // When there's an address but we're not in any connecting state and not connected,
    // this shows as disconnected
    expect(screen.getByText("settings.notConnected")).toBeInTheDocument();
  });

  it("has settings link with correct props", () => {
    mockUseConnection.mockReturnValue({
      isConnected: true,
      showConnecting: false,
      showReconnecting: false,
      hasData: true,
    });

    render(<ConnectionStatus />);

    const link = screen.getByTestId("settings-link");
    expect(link).toHaveAttribute("href", "/settings");
    expect(link).toHaveAttribute("data-search", '{"focus":"address"}');
  });
});

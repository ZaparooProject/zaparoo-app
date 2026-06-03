import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { DeviceConnectionCard } from "@/components/DeviceConnectionCard";
import { useStatusStore } from "@/lib/store";

// Mock useConnection hook
const mockUseConnection = vi.fn();
vi.mock("@/hooks/useConnection", () => ({
  useConnection: () => mockUseConnection(),
}));

// Mock coreApi
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    version: vi.fn().mockResolvedValue({
      version: "1.0.0",
      platform: "linux",
    }),
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
}));

// Mock TanStack Query
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: {
        version: "1.0.0",
        platform: "linux",
      },
      isLoading: false,
    })),
  };
});

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

// Mock TanStack Router Link
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    "aria-label": ariaLabel,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    "aria-label"?: string;
    className?: string;
  }) => (
    <a href={to} aria-label={ariaLabel} className={className}>
      {children}
    </a>
  ),
}));

describe("DeviceConnectionCard", () => {
  const defaultProps = {
    address: "192.168.1.100",
    setAddress: vi.fn(),
    onAddressChange: vi.fn(),
    connectionError: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConnection.mockReturnValue({
      isConnected: true,
      showConnecting: false,
      showReconnecting: false,
      openPairingModal: () => {},
    });
    // Seed encryptionState so connected-state assertions don't hit the
    // "verifying" UI gate (encryptionState === "unknown" -> connecting).
    useStatusStore.setState({
      encryptionState: "plaintext",
      pairingRequired: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the device address input", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("192.168.1.100");
  });

  it("renders the device label", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    expect(screen.getByText("settings.device")).toBeInTheDocument();
  });

  it("calls setAddress when input changes", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "192.168.1.200" } });

    expect(defaultProps.setAddress).toHaveBeenCalledWith("192.168.1.200");
  });

  it("renders connection status when connected", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    // ConnectionStatusDisplay shows "Connected" heading when connected
    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
  });

  it("shows address validation error when provided", () => {
    render(
      <DeviceConnectionCard
        {...defaultProps}
        addressError="settings.deviceAddressInvalid"
      />,
    );

    expect(
      screen.getByText("settings.deviceAddressInvalid"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows connection error when provided", () => {
    mockUseConnection.mockReturnValue({
      isConnected: false,
      showConnecting: false,
      showReconnecting: false,
      openPairingModal: () => {},
    });

    render(
      <DeviceConnectionCard
        {...defaultProps}
        connectionError="Connection failed"
      />,
    );

    // ConnectionStatusDisplay shows error text
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("renders a link to the device history page", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const historyLink = screen.getByRole("link", {
      name: /settings.deviceHistory/i,
    });
    expect(historyLink).toBeInTheDocument();
    expect(historyLink).toHaveAttribute("href", "/settings/devices");
  });

  it("has device address input accessible", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
  });

  it("handles empty address", () => {
    render(<DeviceConnectionCard {...defaultProps} address="" />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("");
  });

  it("renders placeholder text", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("placeholder", "192.168.1.23");
  });

  it("shows connecting state", () => {
    mockUseConnection.mockReturnValue({
      isConnected: false,
      showConnecting: true,
      showReconnecting: false,
      openPairingModal: () => {},
    });

    render(<DeviceConnectionCard {...defaultProps} />);

    // ConnectionStatusDisplay shows "Connecting..." when connecting
    expect(screen.getByText("connection.connecting")).toBeInTheDocument();
  });

  it("shows reconnecting state", () => {
    mockUseConnection.mockReturnValue({
      isConnected: false,
      showConnecting: false,
      showReconnecting: true,
      openPairingModal: () => {},
    });

    render(<DeviceConnectionCard {...defaultProps} />);

    // ConnectionStatusDisplay shows "Reconnecting..." when reconnecting
    expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();
  });

  describe("keyboard interaction", () => {
    it("should call onAddressChange when Enter is pressed with changed address", () => {
      const onAddressChange = vi.fn();
      render(
        <DeviceConnectionCard
          {...defaultProps}
          address="192.168.1.200"
          onAddressChange={onAddressChange}
        />,
      );

      const input = screen.getByRole("textbox");
      fireEvent.keyUp(input, { key: "Enter" });

      expect(onAddressChange).toHaveBeenCalledWith("192.168.1.200");
    });

    it("should not call onAddressChange when Enter is pressed with same address", () => {
      const onAddressChange = vi.fn();
      // savedAddress from mock is "192.168.1.100"
      render(
        <DeviceConnectionCard
          {...defaultProps}
          address="192.168.1.100"
          onAddressChange={onAddressChange}
        />,
      );

      const input = screen.getByRole("textbox");
      fireEvent.keyUp(input, { key: "Enter" });

      expect(onAddressChange).not.toHaveBeenCalled();
    });

    it("should not call onAddressChange for other keys", () => {
      const onAddressChange = vi.fn();
      render(
        <DeviceConnectionCard
          {...defaultProps}
          address="192.168.1.200"
          onAddressChange={onAddressChange}
        />,
      );

      const input = screen.getByRole("textbox");
      fireEvent.keyUp(input, { key: "Tab" });
      fireEvent.keyUp(input, { key: "Escape" });

      expect(onAddressChange).not.toHaveBeenCalled();
    });
  });

  // Note: Network scan button tests require modifying Capacitor.isNativePlatform mock
  // which is set at module level. These tests are covered in integration tests.
  describe("network scan button", () => {
    it("should not show network scan button on web platform by default", () => {
      // Default mock returns false for isNativePlatform
      const onScanClick = vi.fn();
      render(
        <DeviceConnectionCard {...defaultProps} onScanClick={onScanClick} />,
      );

      expect(
        screen.queryByRole("button", { name: /settings.networkScan.title/i }),
      ).not.toBeInTheDocument();
    });

    it("should not show network scan button when onScanClick is not provided", () => {
      render(
        <DeviceConnectionCard {...defaultProps} onScanClick={undefined} />,
      );

      expect(
        screen.queryByRole("button", { name: /settings.networkScan.title/i }),
      ).not.toBeInTheDocument();
    });
  });
});

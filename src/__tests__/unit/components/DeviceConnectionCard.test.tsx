import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { DeviceConnectionCard } from "@/components/DeviceConnectionCard";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.device": "Device Address",
        "settings.deviceHistory": "Device History",
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock("@/hooks/useConnection", () => ({
  useConnection: vi.fn(() => ({
    isConnected: true,
    isConnecting: false,
    connectionError: null,
  })),
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    version: vi.fn().mockResolvedValue({
      version: "1.0.0",
      platform: "test-platform",
    }),
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
}));

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

vi.mock("@/components/ConnectionStatusDisplay", () => ({
  ConnectionStatusDisplay: ({
    connectionError,
    connectedSubtitle,
    action,
  }: {
    connectionError: string;
    connectedSubtitle?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="connection-status">
      {connectionError && (
        <span data-testid="connection-error">{connectionError}</span>
      )}
      {connectedSubtitle && (
        <span data-testid="connected-subtitle">{connectedSubtitle}</span>
      )}
      {action}
    </div>
  ),
}));

describe("DeviceConnectionCard", () => {
  const defaultProps = {
    address: "192.168.1.100",
    setAddress: vi.fn(),
    onAddressChange: vi.fn(),
    connectionError: "",
    hasDeviceHistory: true,
    onHistoryClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(screen.getByText("Device Address")).toBeInTheDocument();
  });

  it("calls setAddress when input changes", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "192.168.1.200" } });

    expect(defaultProps.setAddress).toHaveBeenCalledWith("192.168.1.200");
  });

  it("renders connection status display", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    expect(screen.getByTestId("connection-status")).toBeInTheDocument();
  });

  it("shows connection error when provided", () => {
    render(
      <DeviceConnectionCard
        {...defaultProps}
        connectionError="Connection failed"
      />,
    );

    expect(screen.getByTestId("connection-error")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("shows device history button", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const historyButton = screen.getByRole("button", {
      name: /device history/i,
    });
    expect(historyButton).toBeInTheDocument();
  });

  it("calls onHistoryClick when history button is clicked", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const historyButton = screen.getByRole("button", {
      name: /device history/i,
    });
    fireEvent.click(historyButton);

    expect(defaultProps.onHistoryClick).toHaveBeenCalled();
  });

  it("disables history button when no device history", () => {
    render(<DeviceConnectionCard {...defaultProps} hasDeviceHistory={false} />);

    const historyButton = screen.getByRole("button", {
      name: /device history/i,
    });
    expect(historyButton).toBeDisabled();
  });

  it("has device address input accessible", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
  });

  it("displays connected subtitle when version data is available", () => {
    render(<DeviceConnectionCard {...defaultProps} />);

    expect(screen.getByTestId("connected-subtitle")).toBeInTheDocument();
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
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../../../test-utils";
import { ConnectionStatus } from "../../../../components/home/ConnectionStatus";
import { ConnectionState } from "../../../../lib/store";

// Mock coreApi
vi.mock("../../../../lib/coreApi", () => ({
  getDeviceAddress: vi.fn(() => "192.168.1.100")
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === "scan.connectedSub" && options?.ip) {
        return `Connected to ${options.ip}`;
      }
      return key;
    }
  })
}));

// Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search }: any) => (
    <a href={to} data-testid="settings-link" data-search={JSON.stringify(search)}>
      {children}
    </a>
  )
}));

describe("ConnectionStatus", () => {
  it("renders disconnected state with warning", () => {
    render(<ConnectionStatus connectionState={ConnectionState.DISCONNECTED} />);
    
    expect(screen.getByText("scan.noDevices")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders connected state with device address", () => {
    render(<ConnectionStatus connectionState={ConnectionState.CONNECTED} />);
    
    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByText("Connected to 192.168.1.100")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders connecting state with loading indicator", () => {
    render(<ConnectionStatus connectionState={ConnectionState.CONNECTING} />);
    
    expect(screen.getByText("scan.connecting")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders reconnecting state with loading indicator", () => {
    render(<ConnectionStatus connectionState={ConnectionState.RECONNECTING} />);

    expect(screen.getByText("scan.reconnecting")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders error state with retry option", () => {
    render(<ConnectionStatus connectionState={ConnectionState.ERROR} />);
    
    expect(screen.getByText("scan.connectionError")).toBeInTheDocument();
    expect(screen.getByText("scan.retry")).toBeInTheDocument();
  });

  it("should call retry function when retry button is clicked", () => {
    const mockRetry = vi.fn();
    render(<ConnectionStatus connectionState={ConnectionState.ERROR} onRetry={mockRetry} />);
    
    const retryButton = screen.getByText("scan.retry");
    retryButton.click();
    
    expect(mockRetry).toHaveBeenCalled();
  });

  it("renders idle state with warning", () => {
    render(<ConnectionStatus connectionState={ConnectionState.IDLE} />);
    
    expect(screen.getByText("scan.noDevices")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
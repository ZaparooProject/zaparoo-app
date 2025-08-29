import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../../../test-utils";
import { ConnectionStatus } from "../../../../components/home/ConnectionStatus";

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
    render(<ConnectionStatus connected={false} />);
    
    expect(screen.getByText("scan.noDevices")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders connected state with device address", () => {
    render(<ConnectionStatus connected={true} />);
    
    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByText("Connected to 192.168.1.100")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
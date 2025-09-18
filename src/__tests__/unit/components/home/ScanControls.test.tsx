import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import { ScanControls } from "../../../../components/home/ScanControls";
import { ScanResult } from "../../../../lib/models";
import { Capacitor } from "@capacitor/core";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn()
  }
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

describe("ScanControls", () => {
  const mockProps = {
    scanSession: false,
    scanStatus: ScanResult.Default,
    connected: true,
    onScanButton: vi.fn(),
    onCameraScan: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders scan spinner when on native platform", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    
    render(<ScanControls {...mockProps} />);
    
    const spinnerText = screen.getByText(/spinner\.pressToScan/);
    expect(spinnerText).toBeInTheDocument();
  });

  it("calls onScanButton when scan area is clicked", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    
    render(<ScanControls {...mockProps} />);
    
    // The scan area is a div with onClick, not a button
    const spinnerContainer = screen.getByText(/spinner\.pressToScan/);
    spinnerContainer.click();
    
    expect(mockProps.onScanButton).toHaveBeenCalledTimes(1);
  });

  it("renders camera scan button when connected and on native", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    
    render(<ScanControls {...mockProps} connected={true} />);
    
    const cameraButton = screen.getByRole("button", { name: /scan\.cameraMode/i });
    expect(cameraButton).toBeInTheDocument();
  });

  it("does not render camera scan button when disconnected", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    
    render(<ScanControls {...mockProps} connected={false} />);
    
    const cameraButton = screen.queryByRole("button", { name: /scan\.cameraMode/i });
    expect(cameraButton).not.toBeInTheDocument();
  });

  it("does not render scan spinner on web platform", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    
    render(<ScanControls {...mockProps} />);
    
    const spinnerText = screen.queryByText(/spinner\.pressToScan/);
    expect(spinnerText).not.toBeInTheDocument();
  });
});
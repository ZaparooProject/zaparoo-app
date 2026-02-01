import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { NetworkScanModal } from "@/components/NetworkScanModal";
import { Capacitor } from "@capacitor/core";
import {
  __simulateDeviceDiscovered,
  type ZeroConfService,
} from "../../../__mocks__/capacitor-zeroconf";

// Helper to create mock ZeroConf services
const createMockService = (
  overrides: Partial<ZeroConfService> = {},
): ZeroConfService => ({
  domain: "local.",
  type: "_zaparoo._tcp.",
  name: "Test Device",
  port: 7497,
  hostname: "test-device.local",
  ipv4Addresses: ["192.168.1.100"],
  ipv6Addresses: [],
  txtRecord: {},
  ...overrides,
});

describe("NetworkScanModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to native platform for network scanning to work
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  describe("rendering", () => {
    it("should render modal when open", () => {
      // Arrange & Act
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Assert - SlideModal renders title twice (mobile + desktop)
      const titles = screen.getAllByText("settings.networkScan.title");
      expect(titles.length).toBeGreaterThan(0);
    });

    it("should hide content via aria-hidden when closed", () => {
      // Arrange & Act
      render(
        <NetworkScanModal
          isOpen={false}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Assert - Modal should be hidden (aria-hidden="true")
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("scanning state", () => {
    it("should start scanning when modal opens", async () => {
      // Arrange & Act
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Assert - Should show scanning indicator
      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });
    });

    it("should stop scanning when modal closes", async () => {
      // Arrange
      const { rerender } = render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Wait for scanning UI to appear
      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act - close modal
      rerender(
        <NetworkScanModal
          isOpen={false}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Assert - Modal should be hidden
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });

    it("should show loading indicator when scanning with no devices", async () => {
      // Arrange & Act
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Assert - Should show searching message while scanning
      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });
    });

    it("should show still searching indicator when scanning with devices", async () => {
      // Arrange
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Wait for scan to start
      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act - Simulate device discovery
      act(() => {
        __simulateDeviceDiscovered(createMockService({ name: "MiSTer" }));
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByText("MiSTer")).toBeInTheDocument();
        expect(
          screen.getByText("settings.networkScan.stillSearching"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("device list", () => {
    it("should display discovered devices", async () => {
      // Arrange
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act - Simulate device discoveries
      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "MiSTer FPGA",
            ipv4Addresses: ["192.168.1.100"],
            txtRecord: { version: "1.5.0", platform: "linux" },
          }),
        );
      });

      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "Raspberry Pi",
            ipv4Addresses: ["192.168.1.101"],
            txtRecord: { version: "1.4.0", platform: "linux" },
          }),
        );
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByText("MiSTer FPGA")).toBeInTheDocument();
        expect(screen.getByText("Raspberry Pi")).toBeInTheDocument();
      });
    });

    it("should display device address", async () => {
      // Arrange
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act
      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "MiSTer",
            ipv4Addresses: ["192.168.1.100"],
            port: 7497,
          }),
        );
      });

      // Assert - default port is hidden in connection string
      await waitFor(() => {
        expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
      });
    });

    it("should display address with port when not default", async () => {
      // Arrange
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act
      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "MiSTer",
            ipv4Addresses: ["192.168.1.100"],
            port: 8080,
          }),
        );
      });

      // Assert - non-default port is shown
      await waitFor(() => {
        expect(screen.getByText("192.168.1.100:8080")).toBeInTheDocument();
      });
    });

    it("should display platform when available", async () => {
      // Arrange
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act
      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "MiSTer",
            txtRecord: { platform: "mister" },
          }),
        );
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByText("mister")).toBeInTheDocument();
      });
    });

    it("should display version when available", async () => {
      // Arrange
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act
      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "MiSTer",
            txtRecord: { version: "1.5.0" },
          }),
        );
      });

      // Assert - Translation key with interpolation
      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.version"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("device selection", () => {
    it("should call onSelectDevice with address when device clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectDevice = vi.fn();

      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={onSelectDevice}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "MiSTer",
            ipv4Addresses: ["192.168.1.100"],
            port: 7497,
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("MiSTer")).toBeInTheDocument();
      });

      // Act - Click the device card
      await user.click(screen.getByText("MiSTer"));

      // Assert
      expect(onSelectDevice).toHaveBeenCalledWith("192.168.1.100");
    });

    it("should include port in selection when not default", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectDevice = vi.fn();

      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={onSelectDevice}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      act(() => {
        __simulateDeviceDiscovered(
          createMockService({
            name: "Custom Device",
            ipv4Addresses: ["192.168.1.100"],
            port: 9000,
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("Custom Device")).toBeInTheDocument();
      });

      // Act
      await user.click(screen.getByText("Custom Device"));

      // Assert
      expect(onSelectDevice).toHaveBeenCalledWith("192.168.1.100:9000");
    });

    it("should close modal when device is selected", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <NetworkScanModal
          isOpen={true}
          onClose={onClose}
          onSelectDevice={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      act(() => {
        __simulateDeviceDiscovered(createMockService({ name: "MiSTer" }));
      });

      await waitFor(() => {
        expect(screen.getByText("MiSTer")).toBeInTheDocument();
      });

      // Act
      await user.click(screen.getByText("MiSTer"));

      // Assert - modal closes when device is selected (which stops scanning)
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("error state", () => {
    it("should display error message on non-native platform", async () => {
      // Arrange - Set platform to non-native
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      // Act
      render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Assert - Should show error about mobile-only feature
      await waitFor(() => {
        expect(
          screen.getByText(
            "Network scanning is only available on mobile devices",
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("close behavior", () => {
    it("should hide modal content when close is triggered", async () => {
      // Arrange
      const { rerender } = render(
        <NetworkScanModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("settings.networkScan.searching"),
        ).toBeInTheDocument();
      });

      // Act
      rerender(
        <NetworkScanModal
          isOpen={false}
          onClose={vi.fn()}
          onSelectDevice={vi.fn()}
        />,
      );

      // Assert - Modal should be hidden
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { ScanSettings } from "@/components/home/ScanSettings";
import { Capacitor } from "@capacitor/core";

// Note: useHaptics uses Capacitor Haptics plugin which is already
// mocked globally in test-setup.ts. No additional mocking needed.

describe("ScanSettings", () => {
  const defaultProps = {
    connected: true,
    restartScan: false,
    setRestartScan: vi.fn(),
    launchOnScan: false,
    setLaunchOnScan: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default to native platform
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  describe("when disconnected", () => {
    it("should only show continuous scan toggle", () => {
      // Arrange & Act
      render(<ScanSettings {...defaultProps} connected={false} />);

      // Assert
      expect(screen.getByText("scan.continuous")).toBeInTheDocument();
      expect(screen.queryByText("scan.launchOnScan")).not.toBeInTheDocument();
    });

    it("should allow toggling continuous scan when disconnected", async () => {
      // Arrange
      const user = userEvent.setup();
      const setRestartScan = vi.fn();
      render(
        <ScanSettings
          {...defaultProps}
          connected={false}
          restartScan={false}
          setRestartScan={setRestartScan}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("checkbox", { name: "scan.continuous" }),
      );

      // Assert
      expect(setRestartScan).toHaveBeenCalledWith(true);
    });
  });

  describe("when connected on native platform", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it("should show both toggle switches", () => {
      // Arrange & Act
      render(<ScanSettings {...defaultProps} connected={true} />);

      // Assert
      expect(screen.getByText("scan.continuous")).toBeInTheDocument();
      expect(screen.getByText("scan.launchOnScan")).toBeInTheDocument();
    });

    it("should have two switch controls", () => {
      // Arrange & Act
      render(<ScanSettings {...defaultProps} connected={true} />);

      // Assert
      const switches = screen.getAllByRole("checkbox");
      expect(switches).toHaveLength(2);
    });

    it("should toggle continuous scan setting", async () => {
      // Arrange
      const user = userEvent.setup();
      const setRestartScan = vi.fn();
      render(
        <ScanSettings
          {...defaultProps}
          connected={true}
          restartScan={false}
          setRestartScan={setRestartScan}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("checkbox", { name: "scan.continuous" }),
      );

      // Assert
      expect(setRestartScan).toHaveBeenCalledWith(true);
    });

    it("should toggle launch on scan setting", async () => {
      // Arrange
      const user = userEvent.setup();
      const setLaunchOnScan = vi.fn();
      render(
        <ScanSettings
          {...defaultProps}
          connected={true}
          launchOnScan={false}
          setLaunchOnScan={setLaunchOnScan}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("checkbox", { name: "scan.launchOnScan" }),
      );

      // Assert
      expect(setLaunchOnScan).toHaveBeenCalledWith(true);
    });

    it("should reflect current restartScan state", () => {
      // Arrange & Act
      render(
        <ScanSettings {...defaultProps} connected={true} restartScan={true} />,
      );

      // Assert - checkboxes use checked property, not aria-checked
      const continuousSwitch = screen.getByRole("checkbox", {
        name: "scan.continuous",
      });
      expect(continuousSwitch).toBeChecked();
    });

    it("should reflect current launchOnScan state", () => {
      // Arrange & Act
      render(
        <ScanSettings {...defaultProps} connected={true} launchOnScan={true} />,
      );

      // Assert - checkboxes use checked property, not aria-checked
      const launchSwitch = screen.getByRole("checkbox", {
        name: "scan.launchOnScan",
      });
      expect(launchSwitch).toBeChecked();
    });

    it("should toggle off when already enabled", async () => {
      // Arrange
      const user = userEvent.setup();
      const setRestartScan = vi.fn();
      render(
        <ScanSettings
          {...defaultProps}
          connected={true}
          restartScan={true}
          setRestartScan={setRestartScan}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("checkbox", { name: "scan.continuous" }),
      );

      // Assert
      expect(setRestartScan).toHaveBeenCalledWith(false);
    });
  });

  describe("when connected on web platform", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it("should render nothing", () => {
      // Arrange & Act
      render(<ScanSettings {...defaultProps} connected={true} />);

      // Assert - No setting labels should be visible on web platform
      expect(screen.queryByText("scan.continuous")).not.toBeInTheDocument();
      expect(screen.queryByText("scan.launchOnScan")).not.toBeInTheDocument();
    });

    it("should not show any toggles", () => {
      // Arrange & Act
      render(<ScanSettings {...defaultProps} connected={true} />);

      // Assert
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper checkbox inputs", () => {
      // Arrange & Act
      render(<ScanSettings {...defaultProps} connected={true} />);

      // Assert - checkboxes should be present and accessible
      const checkboxes = screen.getAllByRole("checkbox");
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toHaveAttribute("type", "checkbox");
      });
    });

    it("should have accessible names for all switches", () => {
      // Arrange & Act
      render(<ScanSettings {...defaultProps} connected={true} />);

      // Assert
      expect(
        screen.getByRole("checkbox", { name: "scan.continuous" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "scan.launchOnScan" }),
      ).toBeInTheDocument();
    });
  });
});

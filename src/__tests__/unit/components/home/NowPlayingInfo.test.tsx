import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { NowPlayingInfo } from "@/components/home/NowPlayingInfo";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { act } from "@testing-library/react";

// Note: useHaptics uses Capacitor Haptics plugin which is already
// mocked globally in test-setup.ts. No additional mocking needed.

describe("NowPlayingInfo", () => {
  const defaultProps = {
    mediaName: "",
    mediaPath: undefined,
    systemName: "",
    onStop: vi.fn(),
    connected: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset preferences store
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      showFilenames: false,
    });
  });

  describe("rendering", () => {
    it("should render section with accessible heading", () => {
      // Arrange & Act
      render(<NowPlayingInfo {...defaultProps} />);

      // Assert
      expect(
        screen.getByRole("heading", { name: "scan.nowPlayingHeading" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "scan.nowPlayingHeading" }),
      ).toBeInTheDocument();
    });

    it("should display name label", () => {
      // Arrange & Act
      render(<NowPlayingInfo {...defaultProps} />);

      // Assert
      expect(screen.getByText(/scan\.nowPlayingName/)).toBeInTheDocument();
    });

    it("should display system label", () => {
      // Arrange & Act
      render(<NowPlayingInfo {...defaultProps} />);

      // Assert
      expect(screen.getByText(/scan\.nowPlayingSystem/)).toBeInTheDocument();
    });

    it("should render stop button", () => {
      // Arrange & Act
      render(<NowPlayingInfo {...defaultProps} />);

      // Assert
      expect(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      ).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("should show dash with sr-only 'none' when no media playing", () => {
      // Arrange & Act
      render(<NowPlayingInfo {...defaultProps} mediaName="" systemName="" />);

      // Assert - Dashes for name and system
      const dashes = screen.getAllByText("—");
      expect(dashes).toHaveLength(2);

      // Screen reader text
      const srOnlyNones = screen.getAllByText("none");
      expect(srOnlyNones).toHaveLength(2);
      srOnlyNones.forEach((el) => {
        expect(el).toHaveClass("sr-only");
      });
    });

    it("should hide dashes from screen readers", () => {
      // Arrange & Act
      render(<NowPlayingInfo {...defaultProps} mediaName="" systemName="" />);

      // Assert
      const dashes = screen.getAllByText("—");
      dashes.forEach((dash) => {
        expect(dash).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  describe("with media playing", () => {
    it("should display media name", () => {
      // Arrange & Act
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Super Mario Bros"
          systemName="NES"
        />,
      );

      // Assert
      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
    });

    it("should display system name", () => {
      // Arrange & Act
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Super Mario Bros"
          systemName="NES"
        />,
      );

      // Assert
      expect(screen.getByText(/NES/)).toBeInTheDocument();
    });

    it("should show filename when showFilenames preference is enabled", () => {
      // Arrange
      act(() => {
        usePreferencesStore.setState({ showFilenames: true });
      });

      // Act
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Super Mario Bros"
          mediaPath="/games/nes/smb.nes"
          systemName="NES"
        />,
      );

      // Assert - Should show filename from path instead of mediaName
      // filenameFromPath strips valid extensions, so "smb.nes" becomes "smb"
      expect(screen.getByText(/smb/)).toBeInTheDocument();
      expect(screen.queryByText(/Super Mario Bros/)).not.toBeInTheDocument();
    });

    it("should fall back to mediaName when showFilenames is enabled but path is empty", () => {
      // Arrange
      act(() => {
        usePreferencesStore.setState({ showFilenames: true });
      });

      // Act
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Super Mario Bros"
          mediaPath={undefined}
          systemName="NES"
        />,
      );

      // Assert
      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
    });

    it("should show mediaName when showFilenames is disabled even with path", () => {
      // Arrange
      act(() => {
        usePreferencesStore.setState({ showFilenames: false });
      });

      // Act
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Super Mario Bros"
          mediaPath="/games/nes/smb.nes"
          systemName="NES"
        />,
      );

      // Assert
      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
      expect(screen.queryByText(/smb\.nes/)).not.toBeInTheDocument();
    });
  });

  describe("stop button", () => {
    it("should call onStop when clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const onStop = vi.fn();
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Test Game"
          onStop={onStop}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      );

      // Assert
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("should be disabled when not connected", () => {
      // Arrange & Act
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Test Game"
          connected={false}
        />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      ).toBeDisabled();
    });

    it("should be disabled when no media is playing", () => {
      // Arrange & Act
      render(
        <NowPlayingInfo {...defaultProps} mediaName="" connected={true} />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      ).toBeDisabled();
    });

    it("should be enabled when connected and media is playing", () => {
      // Arrange & Act
      render(
        <NowPlayingInfo
          {...defaultProps}
          mediaName="Test Game"
          connected={true}
        />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      ).toBeEnabled();
    });
  });

  describe("default props", () => {
    it("should default connected to true", () => {
      // Arrange & Act
      render(
        <NowPlayingInfo
          mediaName="Test Game"
          systemName="NES"
          onStop={vi.fn()}
        />,
      );

      // Assert - Button should be enabled (connected defaults to true)
      expect(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      ).toBeEnabled();
    });
  });
});

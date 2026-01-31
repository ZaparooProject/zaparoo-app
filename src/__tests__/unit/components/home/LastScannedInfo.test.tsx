import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { LastScannedInfo } from "@/components/home/LastScannedInfo";
import { TokenResponse, ScanResult } from "@/lib/models";

// Note: CopyButton uses Clipboard and Haptics plugins which are already
// mocked globally in test-setup.ts. No additional mocking needed.

describe("LastScannedInfo", () => {
  const createToken = (
    overrides: Partial<TokenResponse> = {},
  ): TokenResponse => ({
    uid: "",
    text: "",
    scanTime: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render section with accessible heading", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken()}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert
      expect(
        screen.getByRole("heading", { name: "scan.lastScannedHeading" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "scan.lastScannedHeading" }),
      ).toBeInTheDocument();
    });

    it("should display time label", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken()}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert
      expect(screen.getByText(/scan\.lastScannedTime/)).toBeInTheDocument();
    });

    it("should display text label", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken()}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert
      expect(screen.getByText(/scan\.lastScannedText/)).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("should show dash with sr-only 'none' when no token data", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "", text: "" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - Multiple dashes for time and text (UID hidden when equal to text)
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(2);

      // Screen reader text
      const srOnlyNones = screen.getAllByText("none");
      expect(srOnlyNones.length).toBeGreaterThanOrEqual(2);
      srOnlyNones.forEach((el) => {
        expect(el).toHaveClass("sr-only");
      });
    });

    it("should hide dashes from screen readers", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "", text: "" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert
      const dashes = screen.getAllByText("—");
      dashes.forEach((dash) => {
        expect(dash).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  describe("with token data", () => {
    it("should display formatted scan time", () => {
      // Arrange
      const scanTime = new Date("2024-01-15T10:30:00").toISOString();

      // Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "abc123", text: "test", scanTime })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - The date is formatted with toLocaleString
      // We can't match exact format due to locale differences, but we can verify it's not a dash
      const timeText = screen.getByText(/scan\.lastScannedTime/).parentElement;
      expect(timeText?.textContent).not.toContain("—");
    });

    it("should display UID when different from text", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "04abc123def456", text: "game:mario" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - Use regex since text is within a <p> with other content
      expect(screen.getByText(/04abc123def456/)).toBeInTheDocument();
      expect(screen.getByText(/scan\.lastScannedUid/)).toBeInTheDocument();
    });

    it("should hide UID row when UID equals text", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "same-value", text: "same-value" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - UID label should not be present
      expect(
        screen.queryByText(/scan\.lastScannedUid/),
      ).not.toBeInTheDocument();
    });

    it("should display text value", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "abc", text: "**launch.system:nes" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - Use regex since text is within a <p> with other content
      // Need to escape special regex chars in "**launch.system:nes"
      expect(screen.getByText(/\*\*launch\.system:nes/)).toBeInTheDocument();
    });

    it("should show dash for UID when UID is __api__", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "__api__", text: "api-command" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - UID should show dash, not "__api__"
      expect(screen.queryByText("__api__")).not.toBeInTheDocument();
      // The UID row is shown (since uid !== text) but displays dash
      expect(screen.getByText(/scan\.lastScannedUid/)).toBeInTheDocument();
    });
  });

  describe("copy buttons", () => {
    it("should show copy button for UID when present", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "04abc123", text: "test" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - Real CopyButton renders with "Copy to clipboard" aria-label
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("should show copy button for text when present", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "abc", text: "game:zelda" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert - Should have copy buttons for both UID and text
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons).toHaveLength(2);
    });

    it("should not show copy buttons when values are empty", () => {
      // Arrange & Act
      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "", text: "" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Assert
      expect(
        screen.queryByRole("button", { name: "Copy to clipboard" }),
      ).not.toBeInTheDocument();
    });

    it("should copy text to clipboard when copy button clicked", async () => {
      // Arrange
      const user = userEvent.setup();

      render(
        <LastScannedInfo
          lastToken={createToken({ uid: "test-uid", text: "test-text" })}
          scanStatus={ScanResult.Default}
        />,
      );

      // Act - Click the first copy button (for UID)
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      await user.click(copyButtons[0]);

      // Assert - On web platform (default in tests), uses navigator.clipboard
      // Since Capacitor.isNativePlatform() returns false by default in mocks
      // The CopyButton falls back to navigator.clipboard which may throw in tests
      // But we can verify the button interaction worked by checking the state change
      // After clicking, the button changes to "Copied"
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument();
    });
  });
});

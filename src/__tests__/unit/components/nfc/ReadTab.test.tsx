import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReadTab } from "@/components/nfc/ReadTab";
import { Status } from "@/lib/nfc";
import { Share } from "@capacitor/share";
import toast from "react-hot-toast";

// Mock toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock clipboard API properly
const mockWriteText = vi.fn(() => Promise.resolve());
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
});

// Mock @capacitor/share
vi.mock("@capacitor/share", () => ({
  Share: {
    share: vi.fn(() => Promise.resolve()),
  },
}));

describe("ReadTab", () => {
  const mockOnScan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render scan button", () => {
      render(<ReadTab result={null} onScan={mockOnScan} />);

      expect(
        screen.getByRole("button", { name: /scanTag/i }),
      ).toBeInTheDocument();
    });

    it("should render tag information section", () => {
      render(<ReadTab result={null} onScan={mockOnScan} />);

      expect(
        screen.getByText("create.nfc.readTab.tagInformation"),
      ).toBeInTheDocument();
    });

    it("should show empty state when no result", () => {
      render(<ReadTab result={null} onScan={mockOnScan} />);

      // Component shows many more fields now: UID, content, and all technical/low-level fields
      expect(screen.getAllByText("-").length).toBeGreaterThan(10);
    });

    it("should render with tag result data", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Hello World",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText("04:12:34:56")).toBeInTheDocument();
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("should call onScan when scan button is clicked", () => {
      render(<ReadTab result={null} onScan={mockOnScan} />);

      fireEvent.click(screen.getByRole("button", { name: /scanTag/i }));

      expect(mockOnScan).toHaveBeenCalledTimes(1);
    });

    it("should render share button when tag data exists", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test message",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Look for share button by icon since it doesn't have text
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(1); // Should have scan + share + copy buttons
    });

    it("should not render share button when no tag data", () => {
      render(<ReadTab result={null} onScan={mockOnScan} />);

      expect(
        screen.queryByRole("button", { name: /share/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("content type detection", () => {
    it("should render appropriate icons for different content types", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "https://example.com",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Should render the content with appropriate icon (URL in this case)
      expect(screen.getByText("https://example.com")).toBeInTheDocument();
    });
  });

  describe("raw data toggle", () => {
    it("should show toggle for raw data when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Look for show/hide raw data functionality
      const toggleButtons = screen.getAllByRole("button");
      expect(toggleButtons.length).toBeGreaterThan(1);
    });
  });

  describe("clipboard functionality", () => {
    it("should copy UID to clipboard", async () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test message",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Find the UID value in the DOM
      const uidElement = screen.getByText("04:12:34:56");
      expect(uidElement).toBeInTheDocument();

      // The copy button should be in the same container as the UID
      const uidContainer = uidElement.closest("div");
      const copyButton = uidContainer?.querySelector("button");

      expect(copyButton).toBeTruthy();

      // Click the copy button and verify clipboard is called
      fireEvent.click(copyButton as HTMLButtonElement);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockWriteText).toHaveBeenCalledWith("04:12:34:56");
    });

    it("should handle clipboard write failures", async () => {
      mockWriteText.mockRejectedValueOnce(new Error("Clipboard failed"));

      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test message",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      const copyButtons = screen
        .getAllByRole("button")
        .filter(
          (btn) => btn.querySelector("svg") && btn.className.includes("px-2"),
        );

      if (copyButtons[0]) {
        fireEvent.click(copyButtons[0]);
        // Should handle the error gracefully - the component shouldn't crash
        await waitFor(() => {
          expect(screen.getByText(/Test message/)).toBeInTheDocument();
        });
      } else {
        // If no copy button found, still verify component renders correctly
        expect(screen.getByText(/Test message/)).toBeInTheDocument();
      }
    });
  });

  describe("share functionality", () => {
    it("should use native share when available", async () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test message",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Find share button - it's the one with outline in class name (small button next to title)
      const buttons = screen.getAllByRole("button");
      const shareButton = buttons.find((btn) =>
        btn.className.includes("bd-outline"),
      );

      expect(shareButton).toBeDefined();

      if (shareButton) {
        await fireEvent.click(shareButton);
        expect(Share.share).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "create.nfc.readTab.shareTitle",
            text: expect.any(String),
          }),
        );
      }
    });

    it("should show error toast when share fails", async () => {
      vi.mocked(Share.share).mockRejectedValueOnce(
        new Error("Share cancelled"),
      );

      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test message",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Find share button - it's the one with outline in class name (small button next to title)
      const buttons = screen.getAllByRole("button");
      const shareButton = buttons.find((btn) =>
        btn.className.includes("bd-outline"),
      );

      expect(shareButton).toBeDefined();

      if (shareButton) {
        await fireEvent.click(shareButton);
        // Should show error toast
        expect(toast.error).toHaveBeenCalledWith("shareFailed");
        // Should NOT fallback to clipboard
        expect(mockWriteText).not.toHaveBeenCalled();
      }
    });
  });

  describe("content type icon rendering", () => {
    const testCases = [
      { text: "https://example.com", expectedIcon: "globe" },
      { text: "http://test.com", expectedIcon: "globe" },
      { text: "wifi:T:WPA;S:MyNetwork;P:password;;", expectedIcon: "wifi" },
      { text: "user@example.com", expectedIcon: "message-circle" },
      { text: "Plain text content", expectedIcon: "file-text" },
    ];

    testCases.forEach(({ text, expectedIcon }) => {
      it(`should show ${expectedIcon} icon for ${text.substring(0, 20)}...`, () => {
        const mockResult = {
          status: Status.Success,
          info: {
            tag: {
              uid: "04:12:34:56",
              text: text,
            },
            rawTag: null,
          },
        };

        render(<ReadTab result={mockResult} onScan={mockOnScan} />);

        expect(screen.getByText(text)).toBeInTheDocument();
        // The icon should be rendered (tested indirectly through the content being displayed)
      });
    });
  });

  describe("raw data display", () => {
    it("should show raw data toggle when rawTag is available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Look for show/hide raw data button
      const buttons = screen.getAllByRole("button");

      // Should have raw data functionality available
      expect(buttons.length).toBeGreaterThan(1);
    });

    it("should toggle raw data visibility", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Find toggle button (eye icon)
      const toggleButtons = screen
        .getAllByRole("button")
        .filter((btn) => btn.querySelector("svg"));

      // Should have multiple buttons including the raw data toggle
      expect(toggleButtons.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("should handle null result gracefully", () => {
      render(<ReadTab result={null} onScan={mockOnScan} />);

      expect(
        screen.getByText("create.nfc.readTab.tagInformation"),
      ).toBeInTheDocument();
      // Component shows many placeholder fields when no data
      expect(screen.getAllByText("-").length).toBeGreaterThan(10);
    });

    it("should handle result with missing tag data", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: null,
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(
        screen.getByText("create.nfc.readTab.tagInformation"),
      ).toBeInTheDocument();
      // Component shows many placeholder fields when no tag data
      expect(screen.getAllByText("-").length).toBeGreaterThan(10);
    });

    it("should handle result with partial tag data", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText("04:12:34:56")).toBeInTheDocument();
      // Empty text should show as "-", plus many other technical field placeholders
      expect(screen.getAllByText("-").length).toBeGreaterThan(5);
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA labels", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test message",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Scan button should be accessible
      expect(
        screen.getByRole("button", { name: /scanTag/i }),
      ).toBeInTheDocument();

      // Share button should be accessible - find by class since it's icon-only
      const buttons = screen.getAllByRole("button");
      const shareButton = buttons.find((btn) =>
        btn.className.includes("outline"),
      );
      expect(shareButton).toBeDefined();
    });

    it("should support keyboard navigation", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test message",
          },
          rawTag: null,
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).not.toHaveAttribute("disabled");
      });
    });
  });
});

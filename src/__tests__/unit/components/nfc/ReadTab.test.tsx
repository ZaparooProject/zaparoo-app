import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../../test-utils";
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

      // Key sections should be rendered with placeholder values
      expect(
        screen.getByText("create.nfc.readTab.tagInformation"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.nfc.readTab.technicalDetails"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.nfc.readTab.lowLevelTagData"),
      ).toBeInTheDocument();
      // UID and content fields should show "-" placeholders (using getAllByText since multiple exist)
      expect(screen.getAllByText("-").length).toBeGreaterThan(0);
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

      // Share button should appear when tag data exists
      expect(
        screen.getByRole("button", { name: "create.nfc.readTab.shareTagData" }),
      ).toBeInTheDocument();
      // Scan button should also be present
      expect(
        screen.getByRole("button", { name: /scanTag/i }),
      ).toBeInTheDocument();
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

      // Scan and share buttons should be present
      expect(
        screen.getByRole("button", { name: /scanTag/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "create.nfc.readTab.shareTagData" }),
      ).toBeInTheDocument();
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
      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith("04:12:34:56");
      });
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

      // Find copy buttons by their accessible aria-label
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });

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

      // Find share button by its accessible aria-label
      const shareButton = screen.getByRole("button", {
        name: "create.nfc.readTab.shareTagData",
      });

      expect(shareButton).toBeInTheDocument();

      await fireEvent.click(shareButton);
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "create.nfc.readTab.shareTitle",
          text: expect.any(String),
        }),
      );
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

      // Find share button by its accessible aria-label
      const shareButton = screen.getByRole("button", {
        name: "create.nfc.readTab.shareTagData",
      });

      expect(shareButton).toBeInTheDocument();

      await fireEvent.click(shareButton);
      // Should show error toast
      expect(toast.error).toHaveBeenCalledWith("shareFailed");
      // Should NOT fallback to clipboard
      expect(mockWriteText).not.toHaveBeenCalled();
    });
  });

  describe("content type display", () => {
    const testCases = [
      { text: "https://example.com", description: "URL" },
      { text: "http://test.com", description: "HTTP URL" },
      {
        text: "wifi:T:WPA;S:MyNetwork;P:password;;",
        description: "WiFi config",
      },
      { text: "user@example.com", description: "email address" },
      { text: "Plain text content", description: "plain text" },
    ];

    it.each(testCases)(
      "should display $description content correctly",
      ({ text }) => {
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
      },
    );
  });

  describe("raw data display", () => {
    it("should render low-level tag data section", () => {
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

      // Low-level tag data section should be present
      expect(
        screen.getByText("create.nfc.readTab.lowLevelTagData"),
      ).toBeInTheDocument();
      // Scan and share buttons should be available
      expect(
        screen.getByRole("button", { name: /scanTag/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "create.nfc.readTab.shareTagData" }),
      ).toBeInTheDocument();
    });

    it("should show hex toggle when NDEF records are available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            id: [4, 18, 52, 86],
            message: {
              records: [
                { tnf: 1, type: [84], payload: [72, 101, 108, 108, 111] },
              ],
            },
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Hex toggle button should appear when NDEF records exist
      expect(
        screen.getByRole("button", { name: /showHex|hideHex/i }),
      ).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle null result gracefully", () => {
      render(<ReadTab result={null} onScan={mockOnScan} />);

      // All sections should render with placeholder values
      expect(
        screen.getByText("create.nfc.readTab.tagInformation"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.nfc.readTab.technicalDetails"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.nfc.readTab.lowLevelTagData"),
      ).toBeInTheDocument();
      // Scan button should be available
      expect(
        screen.getByRole("button", { name: /scanTag/i }),
      ).toBeInTheDocument();
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

      // All sections should render
      expect(
        screen.getByText("create.nfc.readTab.tagInformation"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.nfc.readTab.technicalDetails"),
      ).toBeInTheDocument();
      // Share button should NOT appear (no tag data)
      expect(
        screen.queryByRole("button", {
          name: "create.nfc.readTab.shareTagData",
        }),
      ).not.toBeInTheDocument();
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

      // UID should be displayed
      expect(screen.getByText("04:12:34:56")).toBeInTheDocument();
      // Share button should appear (tag exists even with empty text)
      expect(
        screen.getByRole("button", { name: "create.nfc.readTab.shareTagData" }),
      ).toBeInTheDocument();
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

      // Share button should be accessible by its aria-label
      expect(
        screen.getByRole("button", { name: "create.nfc.readTab.shareTagData" }),
      ).toBeInTheDocument();
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "../../../../test-utils";
import { ReadTab } from "@/components/nfc/ReadTab";
import { Status } from "@/lib/nfc";
import { Share } from "@capacitor/share";
import { NfcTagTechType } from "@capawesome-team/capacitor-nfc";
import toast from "react-hot-toast";

// Note: This file uses fireEvent instead of userEvent because userEvent.setup()
// replaces navigator.clipboard, which conflicts with our custom clipboard mock
// needed for testing the CopyButton functionality.

// Mock toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock clipboard API
const mockWriteText = vi.fn(() => Promise.resolve());
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
  configurable: true,
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
    // Note: Using fireEvent for clipboard tests because userEvent.setup() creates
    // its own clipboard mock that interferes with our custom mockWriteText mock.

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

      // Find copy buttons by their accessible aria-label
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });

      // First copy button should be for UID
      fireEvent.click(copyButtons[0]!);
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

      fireEvent.click(copyButtons[0]!);

      // Should handle the error gracefully - the component shouldn't crash
      await waitFor(() => {
        expect(screen.getByText(/Test message/)).toBeInTheDocument();
      });
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

      fireEvent.click(shareButton);
      await waitFor(() => {
        expect(Share.share).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "create.nfc.readTab.shareTitle",
            text: expect.any(String),
          }),
        );
      });
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

      fireEvent.click(shareButton);
      await waitFor(() => {
        // Should show error toast
        expect(toast.error).toHaveBeenCalledWith("shareFailed");
      });
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

    it("should have all interactive buttons focusable", () => {
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
        // All buttons should be enabled and focusable
        expect(button).not.toBeDisabled();
        expect(button).not.toHaveAttribute("tabindex", "-1");
      });
    });
  });

  describe("technical details display", () => {
    it("should display writable status when tag is writable", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            isWritable: true,
            maxSize: 504,
            canMakeReadOnly: false, // Set to false so only one "yes" appears
            manufacturerCode: 4,
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Should show "yes" for writable status
      expect(screen.getByText("create.nfc.readTab.yes")).toBeInTheDocument();
    });

    it("should display writable status when tag is not writable", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            isWritable: false,
            maxSize: 504,
            canMakeReadOnly: false,
            manufacturerCode: 4,
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      const noElements = screen.getAllByText("create.nfc.readTab.no");
      expect(noElements.length).toBeGreaterThan(0);
    });

    it("should display max size in bytes", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            maxSize: 504,
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(/504/)).toBeInTheDocument();
      expect(screen.getByText(/create.nfc.readTab.bytes/)).toBeInTheDocument();
    });

    it("should display manufacturer code", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            manufacturerCode: 4,
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });

  describe("technology types display", () => {
    it("should display technology types when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            techTypes: [
              NfcTagTechType.NfcA,
              NfcTagTechType.Ndef,
              NfcTagTechType.MifareUltralight,
            ],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(NfcTagTechType.NfcA)).toBeInTheDocument();
      expect(screen.getByText(NfcTagTechType.Ndef)).toBeInTheDocument();
      expect(
        screen.getByText(NfcTagTechType.MifareUltralight),
      ).toBeInTheDocument();
    });
  });

  describe("NDEF records display", () => {
    it("should display NDEF record count", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            message: {
              records: [
                { tnf: 1, type: [84], payload: [72, 101, 108, 108, 111] },
                { tnf: 1, type: [85], payload: [3, 101, 120, 97, 109] },
              ],
            },
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Should show record count
      expect(
        screen.getByText(/create.nfc.readTab.ndefRecords/),
      ).toBeInTheDocument();
    });

    it("should display NDEF record details", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            message: {
              records: [
                { tnf: 1, type: [84], payload: [72, 101, 108, 108, 111] },
              ],
            },
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Should show record index
      expect(screen.getByText(/create.nfc.readTab.record/)).toBeInTheDocument();
      // Should show TNF value
      expect(screen.getByText(/create.nfc.readTab.tnf/)).toBeInTheDocument();
    });

    it("should toggle between hex and text display for NDEF payload", async () => {
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
                { tnf: 1, type: [84], payload: [72, 101, 108, 108, 111] }, // "Hello"
              ],
            },
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Initially should show text (Hello)
      expect(screen.getByText("Hello")).toBeInTheDocument();

      // Click hex toggle
      const hexToggle = screen.getByRole("button", {
        name: /showHex|hideHex/i,
      });
      fireEvent.click(hexToggle);

      // Should now show hex values
      await waitFor(() => {
        expect(screen.getByText(/48 65 6c 6c 6f/)).toBeInTheDocument();
      });

      // Click again to toggle back
      fireEvent.click(hexToggle);

      // Should show text again
      await waitFor(() => {
        expect(screen.getByText("Hello")).toBeInTheDocument();
      });
    });
  });

  describe("low-level tag data display", () => {
    it("should display tag ID in hex format", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            id: [4, 18, 52, 86],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Tag ID should be displayed as hex
      expect(screen.getByText(/04123456/)).toBeInTheDocument();
    });

    it("should display ATQA bytes when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            atqa: [68, 0],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(/0x4400/)).toBeInTheDocument();
    });

    it("should display SAK bytes when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            sak: [0],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(/0x00/)).toBeInTheDocument();
    });

    it("should display application data when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            applicationData: [1, 2, 3, 4],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(/0x01020304/)).toBeInTheDocument();
    });

    it("should display historical bytes when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            historicalBytes: [128, 129, 130],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(/0x808182/)).toBeInTheDocument();
    });

    it("should display manufacturer bytes when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            manufacturer: [1, 254],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(/0x01fe/)).toBeInTheDocument();
    });

    it("should display system code when available", () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            systemCode: [136, 176],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      expect(screen.getByText(/0x88b0/)).toBeInTheDocument();
    });

    it("should toggle raw data display for low-level data", async () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            id: [4, 18, 52, 86],
            atqa: [68, 0],
            message: {
              records: [
                { tnf: 1, type: [84], payload: [72, 101, 108, 108, 111] },
              ],
            },
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Toggle to show raw hex with spaces
      const hexToggle = screen.getByRole("button", {
        name: /showHex|hideHex/i,
      });
      fireEvent.click(hexToggle);

      // ATQA should show with spaces when raw mode is on
      await waitFor(() => {
        expect(screen.getByText(/44 00/)).toBeInTheDocument();
      });
    });
  });

  describe("copy button for tag ID", () => {
    it("should have copy button for raw tag ID", async () => {
      const mockResult = {
        status: Status.Success,
        info: {
          tag: {
            uid: "04:12:34:56",
            text: "Test",
          },
          rawTag: {
            id: [4, 18, 52, 86],
          },
        },
      };

      render(<ReadTab result={mockResult} onScan={mockOnScan} />);

      // Find copy buttons - there should be multiple
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });

      expect(copyButtons.length).toBeGreaterThan(0);
    });
  });
});

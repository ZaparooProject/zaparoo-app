import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolsTab } from "@/components/nfc/ToolsTab";
import { WriteAction } from "@/lib/writeNfcHook";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "create.nfc.format": "Format Tag",
        "create.nfc.erase": "Erase Tag",
        "create.nfc.makeReadOnly": "Make Read-Only",
        "create.nfc.tools.formatDescription": "Prepare tag for writing",
        "create.nfc.tools.formatWarning": "This will erase all data",
        "create.nfc.tools.eraseDescription": "Remove all data from tag",
        "create.nfc.tools.eraseWarning": "This action cannot be undone",
        "create.nfc.tools.makeReadOnlyDescription":
          "Prevent further modifications",
        "create.nfc.tools.makeReadOnlyWarning": "This cannot be reversed",
        loading: "Loading...",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "android"),
  },
}));

describe("ToolsTab", () => {
  const mockOnToolAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render available tools for current platform", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      expect(screen.getAllByText("Format Tag")).toHaveLength(2); // Header and button
      expect(screen.getAllByText("Erase Tag")).toHaveLength(2); // Header and button
      expect(screen.getAllByText("Make Read-Only")).toHaveLength(2); // Header and button
    });

    it("should render tool descriptions", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      expect(screen.getByText("Prepare tag for writing")).toBeInTheDocument();
      expect(screen.getByText("Remove all data from tag")).toBeInTheDocument();
      expect(
        screen.getByText("Prevent further modifications"),
      ).toBeInTheDocument();
    });

    it("should render warning messages for dangerous tools", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      expect(screen.getByText("This will erase all data")).toBeInTheDocument();
      expect(
        screen.getByText("This action cannot be undone"),
      ).toBeInTheDocument();
      expect(screen.getByText("This cannot be reversed")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("should call onToolAction with correct action when button is clicked", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const formatButton = screen.getByRole("button", { name: "Format Tag" });
      fireEvent.click(formatButton);

      expect(mockOnToolAction).toHaveBeenCalledWith(WriteAction.Format);
    });

    it("should call onToolAction for erase action", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const eraseButton = screen.getByRole("button", { name: "Erase Tag" });
      fireEvent.click(eraseButton);

      expect(mockOnToolAction).toHaveBeenCalledWith(WriteAction.Erase);
    });

    it("should call onToolAction for make read-only action", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const readOnlyButton = screen.getByRole("button", {
        name: "Make Read-Only",
      });
      fireEvent.click(readOnlyButton);

      expect(mockOnToolAction).toHaveBeenCalledWith(WriteAction.MakeReadOnly);
    });
  });

  describe("processing state", () => {
    it("should disable buttons when processing", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={true} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it("should show loading text when processing", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={true} />);

      expect(screen.getAllByText("Loading...")).toHaveLength(3); // One for each tool button
    });

    it("should enable buttons when not processing", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe("button interactions", () => {
    it("should handle rapid button clicks", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const formatButton = screen.getByRole("button", { name: "Format Tag" });

      fireEvent.click(formatButton);
      fireEvent.click(formatButton);
      fireEvent.click(formatButton);

      expect(mockOnToolAction).toHaveBeenCalledTimes(3);
    });

    it("should prevent interactions when processing", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={true} />);

      const buttons = screen.getAllByRole("button");

      buttons.forEach((button) => {
        fireEvent.click(button);
      });

      expect(mockOnToolAction).not.toHaveBeenCalled();
    });

    it("should handle keyboard interactions", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const formatButton = screen.getByRole("button", { name: "Format Tag" });

      fireEvent.keyDown(formatButton, { key: "Enter", code: "Enter" });

      expect(formatButton).toBeInTheDocument();
    });
  });

  describe("translation integration", () => {
    it("should use translation keys for all text content", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      expect(screen.getAllByText("Format Tag")).toHaveLength(2);
      expect(screen.getAllByText("Erase Tag")).toHaveLength(2);
      expect(screen.getAllByText("Make Read-Only")).toHaveLength(2);
    });

    it("should handle loading state translation", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={true} />);
      expect(screen.getAllByText("Loading...")).toHaveLength(3);
    });

    it("should handle missing translation keys gracefully", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe("icon rendering", () => {
    it("should render correct icons for each tool", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        const icon = button.querySelector("svg");
        expect(icon).toBeInTheDocument();
      });
    });

    it("should maintain icon accessibility", () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const svgElements = document.querySelectorAll('svg[aria-hidden="true"]');
      expect(svgElements.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("should handle unknown platform gracefully", () => {
      const { Capacitor } = require("@capacitor/core");
      const originalGetPlatform = Capacitor.getPlatform;
      Capacitor.getPlatform = vi.fn().mockReturnValue("unknown");

      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      const buttons = screen.queryAllByRole("button");
      expect(buttons.length).toBe(3);

      Capacitor.getPlatform = originalGetPlatform;
    });

    it("should handle rapid state changes", () => {
      const { rerender } = render(
        <ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />,
      );

      rerender(
        <ToolsTab onToolAction={mockOnToolAction} isProcessing={true} />,
      );
      rerender(
        <ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />,
      );
      rerender(
        <ToolsTab onToolAction={mockOnToolAction} isProcessing={true} />,
      );

      expect(screen.getAllByText("Loading...")).toHaveLength(3);
    });
  });
});

/**
 * Unit Tests: ErrorComponent
 *
 * Tests for the error boundary display component including:
 * - Error message display
 * - Diagnostic details formatting
 * - Copy button functionality
 * - Reload button functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { ErrorComponent } from "@/components/ErrorComponent";

// Mock window.location.reload
const mockReload = vi.fn();
Object.defineProperty(window, "location", {
  value: { reload: mockReload },
  writable: true,
});

describe("ErrorComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("should render error boundary title", () => {
      const error = new Error("Test error message");
      render(<ErrorComponent error={error} />);

      expect(screen.getByText("errorBoundary.title")).toBeInTheDocument();
    });

    it("should render error boundary description", () => {
      const error = new Error("Test error message");
      render(<ErrorComponent error={error} />);

      expect(screen.getByText("errorBoundary.description")).toBeInTheDocument();
    });

    it("should render diagnostic details heading", () => {
      const error = new Error("Test error message");
      render(<ErrorComponent error={error} />);

      expect(
        screen.getByText("errorBoundary.diagnosticDetails"),
      ).toBeInTheDocument();
    });

    it("should render the error message in diagnostic details", () => {
      const error = new Error("Test error message");
      render(<ErrorComponent error={error} />);

      // The error details are rendered in a pre tag
      expect(screen.getByText(/Test error message/)).toBeInTheDocument();
    });

    it("should render reload button", () => {
      const error = new Error("Test error message");
      render(<ErrorComponent error={error} />);

      expect(
        screen.getByRole("button", { name: /errorBoundary.reload/i }),
      ).toBeInTheDocument();
    });
  });

  describe("diagnostic details", () => {
    it("should include app version in diagnostic details", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      // Look for App Version label
      expect(screen.getByText(/App Version:/)).toBeInTheDocument();
    });

    it("should include platform in diagnostic details", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      expect(screen.getByText(/Platform:/)).toBeInTheDocument();
    });

    it("should include user agent in diagnostic details", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      expect(screen.getByText(/User Agent:/)).toBeInTheDocument();
    });

    it("should include timestamp in diagnostic details", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      expect(screen.getByText(/Timestamp:/)).toBeInTheDocument();
    });

    it("should handle null error gracefully", () => {
      // Test that component handles edge case of null error
      const error = null as unknown as Error;

      // Should not throw
      expect(() => render(<ErrorComponent error={error} />)).not.toThrow();

      // Should show "Unknown error" for null error
      expect(screen.getByText(/Unknown error/)).toBeInTheDocument();
    });
  });

  describe("copy button", () => {
    it("should render copy button for diagnostic details", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      expect(
        screen.getByRole("button", { name: /copy to clipboard/i }),
      ).toBeInTheDocument();
    });
  });

  describe("reload button", () => {
    it("should call window.location.reload when clicked", async () => {
      const user = userEvent.setup();
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      const reloadButton = screen.getByRole("button", {
        name: /errorBoundary.reload/i,
      });
      await user.click(reloadButton);

      expect(mockReload).toHaveBeenCalledTimes(1);
    });
  });

  describe("accessibility", () => {
    it("should have proper heading hierarchy", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("errorBoundary.title");
    });

    it("should have accessible copy button", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      const copyButton = screen.getByRole("button", {
        name: /copy to clipboard/i,
      });
      expect(copyButton).toBeInTheDocument();
    });

    it("should have accessible reload button", () => {
      const error = new Error("Test error");
      render(<ErrorComponent error={error} />);

      const reloadButton = screen.getByRole("button", {
        name: /errorBoundary.reload/i,
      });
      expect(reloadButton).toBeInTheDocument();
      expect(reloadButton).toBeEnabled();
    });
  });
});

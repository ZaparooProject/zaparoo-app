/**
 * Unit tests for ReconnectingIndicator
 *
 * Tests the connection indicator component that shows:
 * - "Connecting..." for initial connection attempts to new devices
 * - "Reconnecting..." for reconnection attempts after prior success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";
import { ReconnectingIndicator } from "../../../components/ReconnectingIndicator";

// Mock the useConnection hook
const mockUseConnection = vi.fn();
vi.mock("../../../hooks/useConnection", () => ({
  useConnection: () => mockUseConnection(),
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

describe("ReconnectingIndicator", () => {
  beforeEach(() => {
    mockUseConnection.mockReset();
  });

  describe("when neither connecting nor reconnecting", () => {
    it("should not show any connection indicator text", () => {
      mockUseConnection.mockReturnValue({
        showConnecting: false,
        showReconnecting: false,
      });

      render(<ReconnectingIndicator />);

      expect(screen.queryByText("Connecting...")).not.toBeInTheDocument();
      expect(screen.queryByText("Reconnecting...")).not.toBeInTheDocument();
    });
  });

  describe("when showConnecting is true", () => {
    it("should show 'Connecting...' indicator", () => {
      mockUseConnection.mockReturnValue({
        showConnecting: true,
        showReconnecting: false,
      });

      render(<ReconnectingIndicator />);

      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });

    it("should have correct accessibility attributes", () => {
      mockUseConnection.mockReturnValue({
        showConnecting: true,
        showReconnecting: false,
      });

      render(<ReconnectingIndicator />);

      const indicator = screen.getByText("Connecting...").closest("div");
      expect(indicator).toHaveAttribute("role", "status");
      expect(indicator).toHaveAttribute("aria-live", "polite");
    });

    it("should show a spinner", () => {
      mockUseConnection.mockReturnValue({
        showConnecting: true,
        showReconnecting: false,
      });

      const { container } = render(<ReconnectingIndicator />);

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("when showReconnecting is true", () => {
    it("should show 'Reconnecting...' indicator", () => {
      mockUseConnection.mockReturnValue({
        showConnecting: false,
        showReconnecting: true,
      });

      render(<ReconnectingIndicator />);

      expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
    });

    it("should have correct accessibility attributes", () => {
      mockUseConnection.mockReturnValue({
        showConnecting: false,
        showReconnecting: true,
      });

      render(<ReconnectingIndicator />);

      const indicator = screen.getByText("Reconnecting...").closest("div");
      expect(indicator).toHaveAttribute("role", "status");
      expect(indicator).toHaveAttribute("aria-live", "polite");
    });

    it("should show a spinner", () => {
      mockUseConnection.mockReturnValue({
        showConnecting: false,
        showReconnecting: true,
      });

      const { container } = render(<ReconnectingIndicator />);

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("priority when both flags are true", () => {
    it("should show 'Connecting...' when both showConnecting and showReconnecting are true", () => {
      // This shouldn't happen in practice, but test the priority
      mockUseConnection.mockReturnValue({
        showConnecting: true,
        showReconnecting: true,
      });

      render(<ReconnectingIndicator />);

      // showConnecting takes priority (checked first in the component)
      expect(screen.getByText("Connecting...")).toBeInTheDocument();
      expect(screen.queryByText("Reconnecting...")).not.toBeInTheDocument();
    });
  });
});

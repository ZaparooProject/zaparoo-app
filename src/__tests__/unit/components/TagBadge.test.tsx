import { describe, it, expect } from "vitest";
import { render, screen } from "../../../test-utils";
import { TagBadge } from "@/components/TagBadge";

describe("TagBadge", () => {
  describe("rendering", () => {
    it("should display the type and tag in visual format", () => {
      // Arrange & Act
      render(<TagBadge type="nfc" tag="ntag215" />);

      // Assert - The aria-hidden span shows type:tag format
      expect(screen.getByText("nfc:ntag215")).toBeInTheDocument();
    });

    it("should provide accessible label combining type and tag", () => {
      // Arrange & Act
      render(<TagBadge type="barcode" tag="qr" />);

      // Assert - The accessible label should be "type tag"
      const badge = screen.getByLabelText("barcode qr");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should hide visual text from screen readers", () => {
      // Arrange & Act
      render(<TagBadge type="nfc" tag="ntag213" />);

      // Assert - The inner span has aria-hidden
      const visualText = screen.getByText("nfc:ntag213");
      expect(visualText).toHaveAttribute("aria-hidden", "true");
    });

    it("should have accessible name via aria-label", () => {
      // Arrange & Act
      render(<TagBadge type="uid" tag="12345678" />);

      // Assert
      expect(screen.getByLabelText("uid 12345678")).toBeInTheDocument();
    });
  });

  describe("with various content types", () => {
    const testCases = [
      { type: "nfc", tag: "ntag215", expected: "nfc:ntag215" },
      { type: "uid", tag: "04abc123def456", expected: "uid:04abc123def456" },
      { type: "text", tag: "game.launch", expected: "text:game.launch" },
      { type: "data", tag: "hex1234", expected: "data:hex1234" },
    ] as const;

    it.each(testCases)(
      "should render $type:$tag correctly",
      ({ type, tag, expected }) => {
        // Arrange & Act
        render(<TagBadge type={type} tag={tag} />);

        // Assert
        expect(screen.getByText(expected)).toBeInTheDocument();
        expect(screen.getByLabelText(`${type} ${tag}`)).toBeInTheDocument();
      },
    );
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Configuration validation tests for the tour feature.
 *
 * These tests verify that required translation keys and CSS classes are
 * properly defined. They catch missing configuration before runtime.
 *
 * Note: These are not behavioral integration tests - they validate static
 * configuration files (translations, CSS) that the tour feature depends on.
 */
describe("Tour Configuration Validation", () => {
  describe("translations", () => {
    let translations: { translation: Record<string, unknown> };

    beforeEach(() => {
      const translationsSource = readFileSync(
        resolve(__dirname, "../../translations/en-US.json"),
        "utf-8",
      );
      translations = JSON.parse(translationsSource);
    });

    it("should have tour section defined", () => {
      expect(translations.translation.tour).toBeDefined();
    });

    it("should have step indicator translation", () => {
      const tour = translations.translation.tour as Record<string, unknown>;
      expect(tour.stepIndicator).toBeDefined();
    });

    it("should have all tour step translations", () => {
      const tour = translations.translation.tour as Record<string, unknown>;

      // Welcome step
      const welcome = tour.welcome as Record<string, unknown>;
      expect(welcome).toBeDefined();
      expect(welcome.title).toBeDefined();
      expect(welcome.text).toBeDefined();

      // Device address step
      const deviceAddress = tour.deviceAddress as Record<string, unknown>;
      expect(deviceAddress).toBeDefined();
      expect(deviceAddress.title).toBeDefined();
      expect(deviceAddress.text).toBeDefined();

      // Media database step
      const mediaDatabase = tour.mediaDatabase as Record<string, unknown>;
      expect(mediaDatabase).toBeDefined();
      expect(mediaDatabase.title).toBeDefined();
      expect(mediaDatabase.text).toBeDefined();

      // Create cards step
      const createCards = tour.createCards as Record<string, unknown>;
      expect(createCards).toBeDefined();
      expect(createCards.title).toBeDefined();
      expect(createCards.text).toBeDefined();

      // Complete step
      const complete = tour.complete as Record<string, unknown>;
      expect(complete).toBeDefined();
      expect(complete.title).toBeDefined();
      expect(complete.text).toBeDefined();
    });

    it("should have all button translations", () => {
      const tour = translations.translation.tour as Record<string, unknown>;
      const buttons = tour.buttons as Record<string, unknown>;

      expect(buttons).toBeDefined();
      expect(buttons.skip).toBeDefined();
      expect(buttons.getStarted).toBeDefined();
      expect(buttons.back).toBeDefined();
      expect(buttons.next).toBeDefined();
      expect(buttons.finish).toBeDefined();
    });
  });

  describe("CSS styling", () => {
    let cssSource: string;

    beforeEach(() => {
      cssSource = readFileSync(resolve(__dirname, "../../index.css"), "utf-8");
    });

    it("should have tour-specific CSS classes", () => {
      // Check for zaparoo-tour-step class
      expect(cssSource).toMatch(/\.zaparoo-tour-step/);

      // Check for shepherd styling
      expect(cssSource).toMatch(/\.shepherd-element/);
      expect(cssSource).toMatch(/\.shepherd-content/);
      expect(cssSource).toMatch(/\.shepherd-button/);
      expect(cssSource).toMatch(/\.shepherd-modal-overlay-container/);
    });

    it("should have custom theme colors matching app design", () => {
      // Check that custom colors are used (not default shepherd)
      expect(cssSource).toMatch(/hsl\(210 22% 15%\)/); // --card background
      expect(cssSource).toMatch(/background-image:\s*radial-gradient/); // button gradient
    });
  });
});

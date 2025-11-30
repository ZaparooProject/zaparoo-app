import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Integration tests to ensure tour data attributes are properly placed
 * in the actual component files
 */
describe("Tour Integration - data-tour attributes", () => {
  let settingsSource: string;
  let mediaDatabaseCardSource: string;
  let createIndexSource: string;

  beforeEach(() => {
    settingsSource = readFileSync(
      resolve(__dirname, "../../routes/settings.index.tsx"),
      "utf-8",
    );
    mediaDatabaseCardSource = readFileSync(
      resolve(__dirname, "../../components/MediaDatabaseCard.tsx"),
      "utf-8",
    );
    createIndexSource = readFileSync(
      resolve(__dirname, "../../routes/create.index.tsx"),
      "utf-8",
    );
  });

  describe("settings page", () => {
    it("should have data-tour attribute for device address", () => {
      expect(settingsSource).toMatch(/data-tour="device-address"/);
    });

    it("should wrap device address input with tour target", () => {
      // Check that data-tour is on a div that contains TextInput
      expect(settingsSource).toMatch(
        /<div\s+data-tour="device-address"[\s\S]*?<TextInput/,
      );
    });
  });

  describe("media database card", () => {
    it("should have data-tour attribute for update database button", () => {
      expect(mediaDatabaseCardSource).toMatch(/data-tour="update-database"/);
    });

    it("should wrap update button with tour target", () => {
      // Check that data-tour is on a div that contains the update button
      expect(mediaDatabaseCardSource).toMatch(
        /<div\s+data-tour="update-database"[\s\S]*?<Button/,
      );
    });
  });

  describe("create page", () => {
    it("should have data-tour attribute for create search", () => {
      expect(createIndexSource).toMatch(/data-tour="create-search"/);
    });

    it("should have tour target on Link to search", () => {
      // Check that data-tour is on Link component
      expect(createIndexSource).toMatch(
        /<Link[\s\S]*?data-tour="create-search"/,
      );
    });
  });

  describe("tour service", () => {
    it("should reference all data-tour attributes", () => {
      const tourServiceSource = readFileSync(
        resolve(__dirname, "../../lib/tourService.ts"),
        "utf-8",
      );

      // Check that tourService references the correct data-tour selectors
      expect(tourServiceSource).toMatch(/\[data-tour="device-address"\]/);
      expect(tourServiceSource).toMatch(/\[data-tour="update-database"\]/);
      expect(tourServiceSource).toMatch(/\[data-tour="create-search"\]/);
    });
  });

  describe("translations", () => {
    it("should have all tour translation keys defined", () => {
      const translationsSource = readFileSync(
        resolve(__dirname, "../../translations/en-US.json"),
        "utf-8",
      );

      const translations = JSON.parse(translationsSource);

      // Check tour section exists
      expect(translations.translation.tour).toBeDefined();

      // Check step indicator
      expect(translations.translation.tour.stepIndicator).toBeDefined();

      // Check all steps
      expect(translations.translation.tour.welcome).toBeDefined();
      expect(translations.translation.tour.welcome.title).toBeDefined();
      expect(translations.translation.tour.welcome.text).toBeDefined();

      expect(translations.translation.tour.deviceAddress).toBeDefined();
      expect(translations.translation.tour.deviceAddress.title).toBeDefined();
      expect(translations.translation.tour.deviceAddress.text).toBeDefined();

      expect(translations.translation.tour.mediaDatabase).toBeDefined();
      expect(translations.translation.tour.mediaDatabase.title).toBeDefined();
      expect(translations.translation.tour.mediaDatabase.text).toBeDefined();

      expect(translations.translation.tour.createCards).toBeDefined();
      expect(translations.translation.tour.createCards.title).toBeDefined();
      expect(translations.translation.tour.createCards.text).toBeDefined();

      expect(translations.translation.tour.complete).toBeDefined();
      expect(translations.translation.tour.complete.title).toBeDefined();
      expect(translations.translation.tour.complete.text).toBeDefined();

      // Check buttons
      expect(translations.translation.tour.buttons).toBeDefined();
      expect(translations.translation.tour.buttons.skip).toBeDefined();
      expect(translations.translation.tour.buttons.getStarted).toBeDefined();
      expect(translations.translation.tour.buttons.back).toBeDefined();
      expect(translations.translation.tour.buttons.next).toBeDefined();
      expect(translations.translation.tour.buttons.finish).toBeDefined();
    });
  });

  describe("preferences store", () => {
    it("should have tourCompleted in preferences store", () => {
      const preferencesStoreSource = readFileSync(
        resolve(__dirname, "../../lib/preferencesStore.ts"),
        "utf-8",
      );

      expect(preferencesStoreSource).toMatch(/tourCompleted:\s*boolean/);
      expect(preferencesStoreSource).toMatch(/setTourCompleted/);
    });

    it("should include tourCompleted in DEFAULT_PREFERENCES", () => {
      const preferencesStoreSource = readFileSync(
        resolve(__dirname, "../../lib/preferencesStore.ts"),
        "utf-8",
      );

      expect(preferencesStoreSource).toMatch(
        /DEFAULT_PREFERENCES[\s\S]*?tourCompleted:\s*false/,
      );
    });

    it("should persist tourCompleted in partialize", () => {
      const preferencesStoreSource = readFileSync(
        resolve(__dirname, "../../lib/preferencesStore.ts"),
        "utf-8",
      );

      expect(preferencesStoreSource).toMatch(
        /partialize[\s\S]*?tourCompleted:/,
      );
    });
  });

  describe("root route integration", () => {
    it("should import TourInitializer component", () => {
      const rootSource = readFileSync(
        resolve(__dirname, "../../routes/__root.tsx"),
        "utf-8",
      );

      expect(rootSource).toMatch(/import.*TourInitializer.*from/);
    });

    it("should render TourInitializer in component tree", () => {
      const rootSource = readFileSync(
        resolve(__dirname, "../../routes/__root.tsx"),
        "utf-8",
      );

      expect(rootSource).toMatch(/<TourInitializer\s*\/>/);
    });
  });

  describe("CSS styling", () => {
    it("should have tour-specific CSS classes", () => {
      const cssSource = readFileSync(
        resolve(__dirname, "../../index.css"),
        "utf-8",
      );

      // Check for zaparoo-tour-step class
      expect(cssSource).toMatch(/\.zaparoo-tour-step/);

      // Check for shepherd styling
      expect(cssSource).toMatch(/\.shepherd-element/);
      expect(cssSource).toMatch(/\.shepherd-content/);
      expect(cssSource).toMatch(/\.shepherd-button/);
      expect(cssSource).toMatch(/\.shepherd-modal-overlay-container/);
    });

    it("should have custom theme matching app design", () => {
      const cssSource = readFileSync(
        resolve(__dirname, "../../index.css"),
        "utf-8",
      );

      // Check that custom colors are used (not default shepherd)
      expect(cssSource).toMatch(/hsl\(210 22% 15%\)/); // --card background
      expect(cssSource).toMatch(/background-image:\s*radial-gradient/); // button gradient
    });
  });
});

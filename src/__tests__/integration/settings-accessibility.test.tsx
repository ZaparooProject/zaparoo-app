/**
 * Integration Test: Accessibility Settings Route
 *
 * Tests the accessibility settings page including:
 * - Rendering the accessibility settings page
 * - Text size options visibility based on platform and availability
 * - Text zoom level selection and haptic feedback
 * - Haptics toggle visibility and interaction
 * - Back button navigation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "../../test-utils";
import userEvent from "@testing-library/user-event";

// Use vi.hoisted for variables accessed in mock factories
const { componentRef, mockGoBack, mockApplyZoom, mockImpact } = vi.hoisted(
  () => ({
    componentRef: { current: null as any },
    mockGoBack: vi.fn(),
    mockApplyZoom: vi.fn(),
    mockImpact: vi.fn(),
  }),
);

// Mock TanStack Router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ history: { back: mockGoBack } }),
  };
});

// Mock Capacitor - control native platform detection
let mockIsNativePlatform = true;
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNativePlatform,
  },
}));

// Mock useTextZoom
let mockTextZoomAvailable = true;
vi.mock("@/hooks/useTextZoom", () => ({
  useTextZoom: () => ({
    set: mockApplyZoom,
    isAvailable: mockTextZoomAvailable,
  }),
}));

// Mock useHaptics
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

// Mock store
let mockStoreState = {
  hapticsEnabled: true,
  textZoomLevel: 1.0,
  setHapticsEnabled: vi.fn(),
  setTextZoomLevel: vi.fn(),
  safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
};

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) =>
      selector({
        safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
      }),
  };
});

vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: (selector: any) => selector(mockStoreState),
}));

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Import the route module to capture the component
import "@/routes/settings.accessibility";

const getAccessibilitySettings = () => componentRef.current;

describe("Accessibility Settings Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNativePlatform = true;
    mockTextZoomAvailable = true;
    mockStoreState = {
      hapticsEnabled: true,
      textZoomLevel: 1.0,
      setHapticsEnabled: vi.fn(),
      setTextZoomLevel: vi.fn(),
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const AccessibilitySettings = getAccessibilitySettings();
    return render(<AccessibilitySettings />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "settings.accessibility.title" }),
      ).toBeInTheDocument();
    });

    it("should render the back button", () => {
      renderComponent();
      expect(screen.getByLabelText("nav.back")).toBeInTheDocument();
    });
  });

  describe("text size options", () => {
    it("should show text size options on native with zoom available", () => {
      mockIsNativePlatform = true;
      mockTextZoomAvailable = true;

      renderComponent();

      expect(
        screen.getByText("settings.accessibility.textSize"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radiogroup", {
          name: /settings\.accessibility\.textSize/i,
        }),
      ).toBeInTheDocument();
    });

    it("should render all text size presets", () => {
      renderComponent();

      expect(
        screen.getByRole("radio", {
          name: /settings\.accessibility\.textSizeSmall/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", {
          name: /settings\.accessibility\.textSizeDefault/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", {
          name: /settings\.accessibility\.textSizeLarge/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", {
          name: /settings\.accessibility\.textSizeExtraLarge/i,
        }),
      ).toBeInTheDocument();
    });

    it("should hide text size options on web platform", () => {
      mockIsNativePlatform = false;

      renderComponent();

      expect(
        screen.queryByText("settings.accessibility.textSize"),
      ).not.toBeInTheDocument();
    });

    it("should hide text size options when zoom not available", () => {
      mockIsNativePlatform = true;
      mockTextZoomAvailable = false;

      renderComponent();

      expect(
        screen.queryByText("settings.accessibility.textSize"),
      ).not.toBeInTheDocument();
    });

    it("should indicate current preset as selected", () => {
      mockStoreState.textZoomLevel = 1.15; // Large preset

      renderComponent();

      const largeButton = screen.getByRole("radio", {
        name: /settings\.accessibility\.textSizeLarge/i,
      });
      expect(largeButton).toHaveAttribute("aria-checked", "true");

      const defaultButton = screen.getByRole("radio", {
        name: /settings\.accessibility\.textSizeDefault/i,
      });
      expect(defaultButton).toHaveAttribute("aria-checked", "false");
    });
  });

  describe("text zoom interaction", () => {
    const textSizePresets = [
      { preset: "Small", zoomLevel: 0.85 },
      { preset: "Default", zoomLevel: 1.0 },
      { preset: "Large", zoomLevel: 1.15 },
      { preset: "ExtraLarge", zoomLevel: 1.3 },
    ] as const;

    it.each(textSizePresets)(
      "should update to $preset text size ($zoomLevel) when preset selected",
      async ({ preset, zoomLevel }) => {
        const user = userEvent.setup();
        renderComponent();

        await user.click(
          screen.getByRole("radio", {
            name: new RegExp(
              `settings\\.accessibility\\.textSize${preset}`,
              "i",
            ),
          }),
        );

        expect(mockStoreState.setTextZoomLevel).toHaveBeenCalledWith(zoomLevel);
        expect(mockApplyZoom).toHaveBeenCalledWith(zoomLevel);
      },
    );

    it("should provide haptic feedback when changing text size", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("radio", {
          name: /settings\.accessibility\.textSizeLarge/i,
        }),
      );

      expect(mockImpact).toHaveBeenCalledWith("light");
    });
  });

  describe("haptics toggle", () => {
    it("should show haptics toggle on native platform", () => {
      mockIsNativePlatform = true;

      renderComponent();

      expect(
        screen.getByText("settings.accessibility.haptics"),
      ).toBeInTheDocument();
    });

    it("should hide haptics toggle on web platform", () => {
      mockIsNativePlatform = false;

      renderComponent();

      expect(
        screen.queryByText("settings.accessibility.haptics"),
      ).not.toBeInTheDocument();
    });

    it("should toggle haptics enabled state", async () => {
      const user = userEvent.setup();

      renderComponent();

      // The ToggleSwitch renders a checkbox input
      const toggle = screen.getByRole("checkbox", {
        name: /settings\.accessibility\.haptics/i,
      });
      await user.click(toggle);

      expect(mockStoreState.setHapticsEnabled).toHaveBeenCalled();
    });

    it("should reflect current haptics state", () => {
      mockStoreState.hapticsEnabled = true;

      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings\.accessibility\.haptics/i,
      });
      expect(toggle).toBeChecked();
    });

    it("should reflect disabled haptics state", () => {
      mockStoreState.hapticsEnabled = false;

      renderComponent();

      const toggle = screen.getByRole("checkbox", {
        name: /settings\.accessibility\.haptics/i,
      });
      expect(toggle).not.toBeChecked();
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", async () => {
      const user = userEvent.setup();

      renderComponent();

      await user.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalled();
    });
  });
});

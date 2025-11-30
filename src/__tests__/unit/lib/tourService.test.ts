import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TourNavigate } from "../../../lib/tourService";
import type { TFunction } from "i18next";

// Create reusable mock tour instance at module level
let mockTourInstance: any;
let mockTourConstructor: any;

// Mock Shepherd
vi.mock("shepherd.js", () => {
  mockTourInstance = {
    addStep: vi.fn(),
    start: vi.fn(),
    next: vi.fn(),
    back: vi.fn(),
    cancel: vi.fn(),
    complete: vi.fn(),
    hide: vi.fn(),
    on: vi.fn()
  };

  // Must use regular function (not arrow) for Vitest 4 constructor mocks
  mockTourConstructor = vi.fn(function () { return mockTourInstance; });

  return {
    default: {
      Tour: mockTourConstructor
    }
  };
});

// Import after mock is set up
const { createAppTour } = await import("../../../lib/tourService");

describe("tourService - createAppTour", () => {
  let mockNavigate: TourNavigate;
  let mockT: TFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTourConstructor.mockClear();
    mockTourInstance.addStep.mockClear();

    mockNavigate = vi.fn(() => Promise.resolve());
    mockT = vi.fn((key: string, options?: any) => {
      if (options) {
        return `${key}:${JSON.stringify(options)}`;
      }
      return key;
    }) as any as TFunction;
  });

  it("should create tour with 5 steps when not connected", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    expect(mockTourConstructor).toHaveBeenCalledWith({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        classes: "zaparoo-tour-step",
        scrollTo: { behavior: "smooth", block: "center" }
      }
    });

    expect(tour.addStep).toHaveBeenCalledTimes(5);
  });

  it("should create tour with 4 steps when connected", () => {
    const tour = createAppTour(mockNavigate, mockT, true);

    expect(tour.addStep).toHaveBeenCalledTimes(4);
  });

  it("should include device address step when not connected", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const stepIds = calls.map(call => call[0].id);

    expect(stepIds).toContain("device-address");
  });

  it("should skip device address step when connected", () => {
    const tour = createAppTour(mockNavigate, mockT, true);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const stepIds = calls.map(call => call[0].id);

    expect(stepIds).not.toContain("device-address");
  });

  it("should always include core steps", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const stepIds = calls.map(call => call[0].id);

    expect(stepIds).toContain("welcome");
    expect(stepIds).toContain("media-database");
    expect(stepIds).toContain("create-cards");
    expect(stepIds).toContain("complete");
  });

  it("should use correct step numbering when not connected", () => {
    createAppTour(mockNavigate, mockT, false);

    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 1, total: 5 });
    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 2, total: 5 });
    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 3, total: 5 });
    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 4, total: 5 });
    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 5, total: 5 });
  });

  it("should use correct step numbering when connected", () => {
    createAppTour(mockNavigate, mockT, true);

    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 1, total: 4 });
    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 2, total: 4 });
    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 3, total: 4 });
    expect(mockT).toHaveBeenCalledWith("tour.stepIndicator", { current: 4, total: 4 });
  });

  it("should configure navigation for device address step", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const deviceAddressStep = calls.find(call => call[0].id === "device-address")?.[0] as any;

    expect(deviceAddressStep).toBeDefined();
    expect(deviceAddressStep?.beforeShowPromise).toBeDefined();
    expect(deviceAddressStep?.attachTo).toEqual({
      element: '[data-tour="device-address"]',
      on: "bottom"
    });
  });

  it("should configure navigation for media database step when connected", () => {
    const tour = createAppTour(mockNavigate, mockT, true);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const mediaDatabaseStep = calls.find(call => call[0].id === "media-database")?.[0] as any;

    expect(mediaDatabaseStep).toBeDefined();
    expect(mediaDatabaseStep?.beforeShowPromise).toBeDefined();
  });

  it("should not configure navigation for media database step when not connected", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const mediaDatabaseStep = calls.find(call => call[0].id === "media-database")?.[0] as any;

    expect(mediaDatabaseStep).toBeDefined();
    expect(mediaDatabaseStep?.beforeShowPromise).toBeUndefined();
  });

  it("should configure back button navigation for device address step", async () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const deviceAddressStep = calls.find(call => call[0].id === "device-address")?.[0] as any;

    expect(deviceAddressStep?.buttons).toBeDefined();
    const backButton = deviceAddressStep?.buttons?.find((b: any) => b.secondary === true);

    expect(backButton).toBeDefined();
    expect(typeof backButton?.action).toBe("function");
  });

  it("should configure back button navigation for create cards step", async () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const createCardsStep = calls.find(call => call[0].id === "create-cards")?.[0] as any;

    expect(createCardsStep?.buttons).toBeDefined();
    const backButton = createCardsStep?.buttons?.find((b: any) => b.secondary === true);

    expect(backButton).toBeDefined();
    expect(typeof backButton?.action).toBe("function");
  });

  it("should use translation keys for all text content", () => {
    createAppTour(mockNavigate, mockT, false);

    expect(mockT).toHaveBeenCalledWith("tour.welcome.title");
    expect(mockT).toHaveBeenCalledWith("tour.welcome.text");
    expect(mockT).toHaveBeenCalledWith("tour.deviceAddress.title");
    expect(mockT).toHaveBeenCalledWith("tour.deviceAddress.text");
    expect(mockT).toHaveBeenCalledWith("tour.mediaDatabase.title");
    expect(mockT).toHaveBeenCalledWith("tour.mediaDatabase.text");
    expect(mockT).toHaveBeenCalledWith("tour.createCards.title");
    expect(mockT).toHaveBeenCalledWith("tour.createCards.text");
    expect(mockT).toHaveBeenCalledWith("tour.complete.title");
    expect(mockT).toHaveBeenCalledWith("tour.complete.text");
  });

  it("should use translation keys for all button labels", () => {
    createAppTour(mockNavigate, mockT, false);

    expect(mockT).toHaveBeenCalledWith("tour.buttons.skip");
    expect(mockT).toHaveBeenCalledWith("tour.buttons.getStarted");
    expect(mockT).toHaveBeenCalledWith("tour.buttons.back");
    expect(mockT).toHaveBeenCalledWith("tour.buttons.next");
    expect(mockT).toHaveBeenCalledWith("tour.buttons.finish");
  });

  it("should attach steps to correct DOM elements", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;

    const deviceAddressStep = calls.find(call => call[0].id === "device-address")?.[0] as any;
    expect(deviceAddressStep?.attachTo?.element).toBe('[data-tour="device-address"]');

    const mediaDatabaseStep = calls.find(call => call[0].id === "media-database")?.[0] as any;
    expect(mediaDatabaseStep?.attachTo?.element).toBe('[data-tour="update-database"]');

    const createCardsStep = calls.find(call => call[0].id === "create-cards")?.[0] as any;
    expect(createCardsStep?.attachTo?.element).toBe('[data-tour="create-search"]');
  });

  it("should configure welcome step with skip and get started buttons", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const welcomeStep = calls.find(call => call[0].id === "welcome")?.[0] as any;

    expect(welcomeStep?.buttons).toBeDefined();
    expect(welcomeStep?.buttons).toHaveLength(2);

    const skipButton = welcomeStep?.buttons?.[0];
    const getStartedButton = welcomeStep?.buttons?.[1];

    expect(skipButton?.secondary).toBe(true);
    expect(skipButton?.action).toBe(tour.cancel);
    expect(getStartedButton?.action).toBe(tour.next);
  });

  it("should configure complete step with only finish button", () => {
    const tour = createAppTour(mockNavigate, mockT, false);

    const calls = vi.mocked(tour.addStep).mock.calls;
    const completeStep = calls.find(call => call[0].id === "complete")?.[0] as any;

    expect(completeStep?.buttons).toBeDefined();
    expect(completeStep?.buttons).toHaveLength(1);

    const finishButton = completeStep?.buttons?.[0];
    expect(finishButton?.action).toBe(tour.complete);
  });

  it("should include progress bar in formatted text", () => {
    createAppTour(mockNavigate, mockT, false);

    const formattedTexts = vi.mocked(mockT).mock.results
      .map(result => result.value)
      .filter((value): value is string => typeof value === 'string');

    // Check that some text contains the step indicator pattern
    const hasStepIndicator = formattedTexts.some(text =>
      text.includes('tour.stepIndicator')
    );

    expect(hasStepIndicator).toBe(true);
  });
});

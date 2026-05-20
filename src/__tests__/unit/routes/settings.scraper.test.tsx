import type { ComponentType } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";

const { componentRef, mockGoBack } = vi.hoisted(() => ({
  componentRef: { current: null as ComponentType | null },
  mockGoBack: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: { component: ComponentType }) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ history: { back: mockGoBack } }),
  };
});

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

vi.mock("@/components/CoreOutdatedNotice", () => ({
  CoreOutdatedNotice: () => <div>Core outdated notice</div>,
}));

vi.mock("@/components/MediaScrapeCard", () => ({
  MediaScrapeCard: () => <div>Media scrape card</div>,
}));

import "@/routes/settings.scraper";

const getScraperSettings = () => {
  if (!componentRef.current) {
    throw new Error("ScraperSettings component was not captured");
  }
  return componentRef.current;
};

describe("Settings Scraper Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the scraper settings page content", () => {
    const ScraperSettings = getScraperSettings();

    render(<ScraperSettings />);

    expect(
      screen.getByRole("heading", { name: "settings.scraper.title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Core outdated notice")).toBeInTheDocument();
    expect(screen.getByText("Media scrape card")).toBeInTheDocument();
  });
});

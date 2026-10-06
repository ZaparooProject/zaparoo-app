import type { ComponentType } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "../../../test-utils";

import { useStatusStore } from "@/lib/store";

const { componentRef, mockNavigate } = vi.hoisted(() => ({
  componentRef: { current: null as ComponentType | null },
  mockNavigate: vi.fn(),
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
    useRouter: () => ({ navigate: mockNavigate }),
  };
});

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

import "@/routes/settings.media";

const getMediaSettings = () => {
  if (!componentRef.current) {
    throw new Error("MediaSettings component was not captured");
  }
  return componentRef.current;
};

describe("Settings Media Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState({
      connected: false,
      coreVersion: "2.12.0",
      coreVersionPending: false,
    });
  });

  it("should render the media settings page content", () => {
    const MediaSettings = getMediaSettings();

    render(<MediaSettings />);

    expect(
      screen.getByRole("heading", { name: "settings.media.title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "settings.media.databaseTitle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "settings.media.scraperTitle" }),
    ).toBeInTheDocument();
    const database = screen.getByRole("region", {
      name: "settings.media.databaseTitle",
    });
    const scraper = screen.getByRole("region", {
      name: "settings.media.scraperTitle",
    });
    expect(
      within(database).getByRole("button", { name: "settings.updateDb" }),
    ).toBeDisabled();
    expect(
      within(scraper).getByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
    ).toBeDisabled();
    expect(
      within(scraper).getByRole("checkbox", {
        name: "settings.scrapeMedia.force",
      }),
    ).toBeDisabled();
    expect(
      within(database).queryByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(scraper).queryByRole("button", { name: "settings.updateDb" }),
    ).not.toBeInTheDocument();
  });
});

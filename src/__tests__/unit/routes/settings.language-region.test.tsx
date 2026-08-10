import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test-utils";

const { mockBack, mockChangeLanguage, mockSetSystemNameRegion } = vi.hoisted(
  () => ({
    mockBack: vi.fn(),
    mockChangeLanguage: vi.fn(),
    mockSetSystemNameRegion: vi.fn(),
  }),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => ({ options }),
    useRouter: () => ({ navigate: mockBack }),
  };
});

vi.mock("@/i18n", () => ({
  default: {
    resolvedLanguage: "en-US",
    changeLanguage: mockChangeLanguage,
  },
}));

vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: (
    selector: (state: {
      systemNameRegion: string;
      setSystemNameRegion: typeof mockSetSystemNameRegion;
    }) => unknown,
  ) =>
    selector({
      systemNameRegion: "auto",
      setSystemNameRegion: mockSetSystemNameRegion,
    }),
}));

import { LanguageRegionSettings } from "@/routes/settings.language-region";

describe("Language & Region settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render both localization settings", () => {
    render(<LanguageRegionSettings />);

    expect(
      screen.getByRole("heading", { name: "settings.languageRegion.title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: "settings.languageRegion.appLanguage",
      }),
    ).toHaveValue("en-US");
    expect(
      screen.getByRole("combobox", { name: "settings.systemNames.label" }),
    ).toHaveValue("auto");
  });

  it("should offer every supported app language", () => {
    render(<LanguageRegionSettings />);

    const languageSelect = screen.getByRole("combobox", {
      name: "settings.languageRegion.appLanguage",
    });
    expect(within(languageSelect).getAllByRole("option")).toHaveLength(9);
    expect(
      within(languageSelect).getByRole("option", { name: "English (US)" }),
    ).toBeInTheDocument();
    expect(
      within(languageSelect).getByRole("option", { name: "日本語" }),
    ).toBeInTheDocument();
  });

  it("should update app language and system-name region", () => {
    render(<LanguageRegionSettings />);

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "settings.languageRegion.appLanguage",
      }),
      { target: { value: "ja-JP" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "settings.systemNames.label" }),
      { target: { value: "jp" } },
    );

    expect(mockChangeLanguage).toHaveBeenCalledWith("ja-JP");
    expect(mockSetSystemNameRegion).toHaveBeenCalledWith("jp");
  });

  it("should navigate back from the header", () => {
    render(<LanguageRegionSettings />);

    fireEvent.click(screen.getByRole("button", { name: "nav.back" }));

    expect(mockBack).toHaveBeenCalledWith({
      to: "/settings",
      resetScroll: false,
    });
  });
});

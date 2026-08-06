import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test-utils";
import licenseNotices from "../../../../public/thirdPartyLicenseNotices.json";

const { componentRef, mockBrowserOpen, mockGoBack } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockBrowserOpen: vi.fn(),
  mockGoBack: vi.fn(),
}));

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

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: mockBrowserOpen,
  },
}));

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

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

import "@/routes/settings.licenses";

const getLicenses = () => componentRef.current;

describe("Settings Licenses Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => licenseNotices,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderComponent = () => {
    const ThirdPartyLicenses = getLicenses();
    return render(<ThirdPartyLicenses />);
  };

  it("should list production package licenses", () => {
    renderComponent();

    expect(
      screen.getByRole("heading", { name: "settings.licenses.title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^react\s+19\.2\.5 · MIT$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("@capacitor/core")).toBeInTheDocument();
    expect(screen.getByLabelText("backToTop")).toBeInTheDocument();
  });

  it("should filter packages by package name", async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.type(
      screen.getByLabelText("settings.licenses.searchLabel"),
      "shepherd.js",
    );

    expect(screen.getByText("shepherd.js")).toBeInTheDocument();
    expect(screen.queryByText("@capacitor/core")).not.toBeInTheDocument();
  });

  it("should expand a package to show its license and project link", async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.type(
      screen.getByLabelText("settings.licenses.searchLabel"),
      "shepherd.js",
    );
    await user.click(screen.getByRole("button", { name: /shepherd\.js/ }));

    expect(
      await screen.findByText(/Permission is hereby granted, free of charge/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "settings.licenses.projectWebsite",
      }),
    );
    expect(mockBrowserOpen).toHaveBeenCalledWith({
      url: "https://github.com/shepherd-pro/shepherd",
    });
  });

  it("should navigate back", async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByLabelText("nav.back"));
    expect(mockGoBack).toHaveBeenCalledOnce();
  });
});

import type { ComponentType } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test-utils";

type RouterModule = typeof import("@tanstack/react-router");
type StatusStoreModule = typeof import("@/lib/store");

interface MockRouteOptions {
  component: ComponentType;
}

interface MockStatusState {
  safeInsets: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
}

const mockLicenseNotices = {
  notices: {
    d6d0b29b55171b92:
      "Permission is hereby granted, free of charge, to any person obtaining a copy",
  },
};

const { componentRef, mockBrowserOpen, mockNavigate } = vi.hoisted(() => ({
  componentRef: { current: null as ComponentType | null },
  mockBrowserOpen: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<RouterModule>();
  return {
    ...actual,
    createFileRoute: () => (options: MockRouteOptions) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ navigate: mockNavigate }),
  };
});

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: mockBrowserOpen,
  },
}));

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<StatusStoreModule>();
  return {
    ...actual,
    useStatusStore: <T,>(selector: (state: MockStatusState) => T): T =>
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

const getLicenses = (): ComponentType => {
  if (!componentRef.current) {
    throw new Error("Licenses route component was not registered");
  }
  return componentRef.current;
};

// Every test here renders the full production dependency list, which is slow
// enough on its own to reach the default 10s timeout when the suite runs all
// files in parallel.
describe("Settings Licenses Route", { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLicenseNotices,
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

    expect(
      screen.getByRole("button", { name: /^shepherd\.js\s/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^@capacitor\/core\s/ }),
    ).not.toBeInTheDocument();
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
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/thirdPartyLicenseNotices\.[a-f0-9]{12}\.json$/),
      expect.objectContaining({ signal: expect.anything() }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "settings.licenses.projectWebsite",
      }),
    );
    expect(mockBrowserOpen).toHaveBeenCalledWith({
      url: "https://github.com/shepherd-pro/shepherd",
    });
  });

  it("should show an error when a package notice is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ notices: {} }),
      }),
    );
    const user = userEvent.setup();
    renderComponent();

    await user.type(
      screen.getByLabelText("settings.licenses.searchLabel"),
      "shepherd.js",
    );
    await user.click(screen.getByRole("button", { name: /shepherd\.js/ }));

    expect(
      await screen.findByText("settings.licenses.missingNotice"),
    ).toBeInTheDocument();
  });

  it("should navigate back", async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByLabelText("nav.back"));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings",
      resetScroll: false,
    });
  });
});

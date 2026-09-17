import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Preferences } from "@capacitor/preferences";
import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor, renderHook } from "@/test-utils";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { AccessibilitySettings } from "@/routes/settings.accessibility";
import { logger } from "@/lib/logger";
import {
  usePreferencesStore,
  __resetPreferenceHydrationForTests,
} from "@/lib/preferencesStore";

vi.mock("@/lib/capacitorBridge", () => ({
  isPluginAvailable: () => true,
  isNativePluginAvailable: () => false,
  isCapacitorPluginUnavailableError: () => false,
}));

let dark = false;
let listeners: Set<() => void>;

beforeEach(async () => {
  __resetPreferenceHydrationForTests();
  localStorage.removeItem("vite-ui-theme");
  vi.mocked(Preferences.get).mockResolvedValue({ value: null });
  vi.mocked(Preferences.set).mockResolvedValue(undefined);
  usePreferencesStore.setState({ appearance: null, _hasHydrated: false });
  dark = false;
  listeners = new Set();
  vi.spyOn(window, "matchMedia").mockImplementation(
    () =>
      ({
        get matches() {
          return dark;
        },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_event: string, callback: () => void) =>
          listeners.add(callback),
        removeEventListener: (_event: string, callback: () => void) =>
          listeners.delete(callback),
        addListener: (callback: () => void) => listeners.add(callback),
        removeListener: (callback: () => void) => listeners.delete(callback),
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  );
  await usePreferencesStore.persist.rehydrate();
});

afterEach(() => {
  localStorage.removeItem("vite-ui-theme");
  document.documentElement.classList.remove("light", "dark");
  vi.restoreAllMocks();
});

function changeSystemAppearance(value: boolean) {
  act(() => {
    dark = value;
    listeners.forEach((listener) => listener());
  });
}

describe("appearance", () => {
  it("should follow System live and ignore OS changes under an explicit override", () => {
    const { result, unmount } = renderHook(useTheme, {
      wrapper: ThemeProvider,
    });
    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
    changeSystemAppearance(true);
    expect(result.current.resolvedTheme).toBe("dark");
    act(() => {
      result.current.setTheme("light");
    });
    changeSystemAppearance(false);
    changeSystemAppearance(true);
    expect(result.current.resolvedTheme).toBe("light");
    act(() => {
      result.current.setTheme("system");
    });
    expect(result.current.resolvedTheme).toBe("dark");
    unmount();
    expect(listeners.size).toBe(0);
  });

  it("should refresh System appearance when the app becomes visible again", () => {
    const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
    act(() => {
      dark = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("should support and clean up legacy Core browser media listeners", () => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    Object.assign(query, {
      addEventListener: undefined,
      removeEventListener: undefined,
    });
    vi.mocked(window.matchMedia).mockReturnValue(query);
    const { result, unmount } = renderHook(useTheme, {
      wrapper: ThemeProvider,
    });
    changeSystemAppearance(true);
    expect(result.current.resolvedTheme).toBe("dark");
    unmount();
    expect(listeners.size).toBe(0);
  });

  it.each(["light", "dark", "system"] as const)(
    "should migrate explicit legacy %s and prefer subsequent Preferences choices",
    async (legacy) => {
      localStorage.setItem("vite-ui-theme", legacy);
      usePreferencesStore.setState({ appearance: null });
      await usePreferencesStore.persist.rehydrate();
      expect(usePreferencesStore.getState().appearance).toBe(legacy);
      vi.mocked(Preferences.get).mockResolvedValue({
        value: JSON.stringify({ state: { appearance: "light" }, version: 0 }),
      });
      await usePreferencesStore.persist.rehydrate();
      expect(usePreferencesStore.getState().appearance).toBe("light");
    },
  );

  it("should reject malformed stored and legacy values", async () => {
    localStorage.setItem("vite-ui-theme", "invalid");
    vi.mocked(Preferences.get).mockResolvedValue({
      value: JSON.stringify({ state: { appearance: "invalid" }, version: 0 }),
    });
    await usePreferencesStore.persist.rehydrate();
    expect(usePreferencesStore.getState().appearance).toBe("system");
  });

  it("should wait for hydration before showing appearance-dependent content", () => {
    usePreferencesStore.setState({ _hasHydrated: false });
    render(
      <ThemeProvider>
        <p>Ready</p>
      </ThemeProvider>,
    );
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    act(() => {
      usePreferencesStore.setState({ _hasHydrated: true });
    });
    expect(screen.getByText("Ready")).toBeVisible();
  });

  it("should retain session appearance and report a failed persistence write", async () => {
    const error = new Error("Storage unavailable");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.mocked(Preferences.set).mockRejectedValueOnce(error);
    const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.resolvedTheme).toBe("dark");
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "Failed to persist appearance preference",
        error,
      ),
    );
  });

  it("should persist appearance selected through real accessibility settings", async () => {
    const user = userEvent.setup();
    const root = createRootRoute({
      component: () => (
        <ThemeProvider>
          <AccessibilitySettings />
        </ThemeProvider>
      ),
    });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    const dark = await screen.findByRole("radio", {
      name: "settings.accessibility.appearanceDark",
    });
    await user.click(dark);
    expect(dark).toBeChecked();
    expect(usePreferencesStore.getState().appearance).toBe("dark");
    await waitFor(() =>
      expect(Preferences.set).toHaveBeenCalledWith({
        key: "app-preferences",
        value: expect.stringContaining('"appearance":"dark"'),
      }),
    );
    await user.keyboard("{ArrowLeft}");
    const light = screen.getByRole("radio", {
      name: "settings.accessibility.appearanceLight",
    });
    expect(light).toHaveFocus();
    expect(light).toBeChecked();
    expect(usePreferencesStore.getState().appearance).toBe("light");
  });
});

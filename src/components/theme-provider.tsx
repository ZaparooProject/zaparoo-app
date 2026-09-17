import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  readLegacyAppearance,
  type Appearance,
  type ResolvedAppearance,
} from "@/lib/appearance";

interface ThemeState {
  theme: Appearance;
  resolvedTheme: ResolvedAppearance;
  setTheme: (theme: Appearance) => void;
}

const ThemeContext = createContext<ThemeState>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const hydrated = usePreferencesStore((s) => s._hasHydrated);
  const appearance = usePreferencesStore((s) => s.appearance);
  const setTheme = usePreferencesStore((s) => s.setAppearance);
  const [legacy] = useState(readLegacyAppearance);
  const theme = appearance ?? legacy ?? "system";
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    update();
    // Older Core browsers expose only the legacy MediaQueryList API.
    if (query.addEventListener) query.addEventListener("change", update);
    else query.addListener(update);
    const onVisibility = () => {
      if (!document.hidden) update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (query.removeEventListener)
        query.removeEventListener("change", update);
      else query.removeListener(update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useLayoutEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("light", resolvedTheme === "light");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        resolvedTheme === "dark" ? "#0a0f18" : "#f2f3f5",
      );
  }, [hydrated, resolvedTheme]);

  // Avoid painting persistence-dependent controls in the wrong appearance.
  if (!hydrated) return null;
  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);

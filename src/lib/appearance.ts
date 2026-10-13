export type Appearance = "system" | "light" | "dark";
export type ResolvedAppearance = Exclude<Appearance, "system">;

export function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

/** Read-only migration source; Preferences becomes authoritative after hydration. */
export function readLegacyAppearance(): Appearance | null {
  try {
    const value = window.localStorage.getItem("vite-ui-theme");
    return isAppearance(value) ? value : null;
  } catch {
    return null;
  }
}

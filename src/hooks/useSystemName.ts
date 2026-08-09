import { useCallback, useMemo } from "react";
import type { System } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { systemDisplayName, systemWithDisplayName } from "@/lib/systemNames";

function deviceLocale(): string {
  if (typeof navigator === "undefined") return "en-US";
  return navigator.languages?.[0] || navigator.language || "en-US";
}

export function useSystemNameResolver() {
  const preference = usePreferencesStore((state) => state.systemNameRegion);
  const locale = deviceLocale();

  return useCallback(
    (systemId: string, coreName: string) =>
      systemDisplayName(systemId, coreName, preference, locale),
    [locale, preference],
  );
}

export function useSystemName(systemId: string, coreName: string): string {
  const resolveName = useSystemNameResolver();
  return resolveName(systemId, coreName);
}

export function useSystemsWithDisplayNames(systems: System[]): System[] {
  const preference = usePreferencesStore((state) => state.systemNameRegion);
  const locale = deviceLocale();

  return useMemo(
    () =>
      systems.map((system) =>
        systemWithDisplayName(system, preference, locale),
      ),
    [locale, preference, systems],
  );
}

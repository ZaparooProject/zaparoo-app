import { usePreferencesStore } from "@/lib/preferencesStore";
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";

/**
 * Selects normal-flow list rendering for detected native screen readers or
 * when users enable the manual web/native accessibility preference.
 */
export function useAccessibleLists(): boolean {
  const screenReaderEnabled = useScreenReaderEnabled();
  const accessibleLists = usePreferencesStore((state) => state.accessibleLists);
  return screenReaderEnabled || accessibleLists;
}

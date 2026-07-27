import { useStatusStore } from "@/lib/store";
import {
  FEATURE_GATES,
  type FeatureId,
  isCoreFeatureAvailable,
} from "@/lib/featureGates";

interface CoreFeatureResult {
  available: boolean;
  requiredVersion: string;
  currentVersion: string | null;
  marquee: boolean;
}

export function useCoreFeature(id: FeatureId): CoreFeatureResult {
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const gate = FEATURE_GATES[id];
  // When version is unknown (null or still loading), treat as available so we
  // don't falsely show features as "outdated" — consistent with CoreOutdatedNotice.
  const versionUnknown = coreVersion === null || coreVersionPending;
  return {
    available: versionUnknown || isCoreFeatureAvailable(id, coreVersion),
    requiredVersion: gate?.since ?? "",
    currentVersion: coreVersion,
    marquee: gate?.marquee ?? false,
  };
}

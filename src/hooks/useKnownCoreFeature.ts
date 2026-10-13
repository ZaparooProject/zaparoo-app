import { useStatusStore } from "@/lib/store";
import { type FeatureId, isCoreFeatureAvailable } from "@/lib/featureGates";

/**
 * Feature support judged only from a Core version that is actually known.
 * Unlike `useCoreFeature`, an unknown or pending version is neither available
 * nor unsupported, and the answer does not change when the connection drops,
 * so a panel can keep its place while showing a not-connected state.
 */
export function useKnownCoreFeature(id: FeatureId) {
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const known = coreVersion !== null && !coreVersionPending;
  const available = known && isCoreFeatureAvailable(id, coreVersion);
  return { available, unsupported: known && !available };
}

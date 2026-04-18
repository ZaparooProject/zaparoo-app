import { satisfies as versionSatisfies } from "./coreVersion";

type FeatureGate = { since: string; marquee: boolean; labelKey: string };

// Feature gate registry.
//
// Add an entry here when a new Core feature is being introduced and the app
// needs to gracefully degrade on older Core versions during the migration period.
//
// Fields:
//   since    – minimum Core version that supports this feature (semver string)
//   marquee  – when true, show the UI element disabled with a tooltip instead of hiding it
//   labelKey – i18n key used to name this feature in the "Core outdated" settings notice
//
// Example entry (uncomment and populate when gating a real feature):
//   screenshot: { since: "2.0.0", marquee: true, labelKey: "features.screenshot" },
export const FEATURE_GATES: Record<string, FeatureGate> = {};

export type FeatureId = keyof typeof FEATURE_GATES;

export function isCoreFeatureAvailable(
  id: FeatureId,
  version: string | null,
): boolean {
  const gate = FEATURE_GATES[id];
  if (!gate) return true;
  return versionSatisfies(version, gate.since);
}

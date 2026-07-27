import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type FeatureId } from "@/lib/featureGates";
import { useCoreFeature } from "@/hooks/useCoreFeature";

interface GatedFeatureProps {
  featureId: FeatureId;
  children: ReactNode;
}

// Conditionally renders children based on Core feature availability.
// - Non-marquee unavailable: renders nothing (hide silently).
// - Marquee unavailable: renders children visually disabled with a tooltip.
// - Available: renders children unchanged.
export function GatedFeature({ featureId, children }: GatedFeatureProps) {
  const { t } = useTranslation();
  const { available, requiredVersion, marquee } = useCoreFeature(featureId);

  if (available) return <>{children}</>;

  if (!marquee) return null;

  return (
    <div
      title={t("features.requiresCoreVersion", { version: requiredVersion })}
      aria-label={t("features.requiresCoreVersion", {
        version: requiredVersion,
      })}
      className="cursor-not-allowed"
    >
      <div className="pointer-events-none opacity-50">{children}</div>
    </div>
  );
}

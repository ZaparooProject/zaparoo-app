import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "@/lib/store";
import { FEATURE_GATES, isCoreFeatureAvailable } from "@/lib/featureGates";
import { compareVersions } from "@/lib/coreVersion";
import { Card } from "./wui/Card";

export function CoreOutdatedNotice() {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );

  if (!connected || coreVersionPending || coreVersion === null) return null;

  const outdatedFeatures = Object.entries(FEATURE_GATES).filter(
    ([id]) => !isCoreFeatureAvailable(id, coreVersion),
  );

  if (outdatedFeatures.length === 0) return null;

  const highestRequired = outdatedFeatures.reduce((max, [, gate]) => {
    return compareVersions(gate.since, max) > 0 ? gate.since : max;
  }, "0.0.0");

  return (
    <div role="alert" aria-live="polite">
      <Card className="border-yellow-500/40 bg-yellow-500/10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <TriangleAlert
              size={18}
              className="text-warning shrink-0"
              aria-hidden="true"
            />
            <p className="text-warning text-sm font-medium">
              {t("settings.coreOutdated.title", { version: highestRequired })}
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            {t("settings.coreOutdated.description")}
          </p>
          <ul className="text-muted-foreground list-inside list-disc text-sm">
            {outdatedFeatures.map(([id, gate]) => (
              <li key={id}>{t(gate.labelKey)}</li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

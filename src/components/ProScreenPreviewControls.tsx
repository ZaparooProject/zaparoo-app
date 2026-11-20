import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProPurchase } from "@/components/ProPurchase";
import { Button } from "@/components/wui/Button";
import { Select } from "@/components/wui/Select";
import { useProGuideStore } from "@/lib/proGuideStore";
import type { ProPurchaseSource } from "@/lib/store";

const SOURCES: ProPurchaseSource[] = ["nfc", "camera", "shake", "settings"];

/**
 * Purchase preview builds only: opens the Pro purchase screen as each entry
 * point shows it, and the guide that follows a purchase, without buying.
 * Preview builds send no usage counts.
 */
export function ProScreenPreviewControls() {
  const { t } = useTranslation();
  const [source, setSource] = useState<ProPurchaseSource>("nfc");
  const { purchaseModal, setProPurchaseModalOpen } = useProPurchase();
  const showGuide = useProGuideStore((state) => state.show);

  return (
    <>
      <Select
        id="pro-screen-preview-source"
        label={t("settings.advanced.proPreviewSource")}
        value={source}
        onChange={(event) => setSource(event.target.value as ProPurchaseSource)}
      >
        {SOURCES.map((value) => (
          <option key={value} value={value}>
            {t(`settings.advanced.proPreviewSources.${value}`)}
          </option>
        ))}
      </Select>
      <Button
        label={t("settings.advanced.proPreviewShowScreen")}
        variant="outline"
        onClick={() => setProPurchaseModalOpen(true, source)}
        className="w-full"
      />
      <Button
        label={t("settings.advanced.proPreviewShowGuide")}
        variant="outline"
        onClick={() => showGuide()}
        className="w-full"
      />
      {purchaseModal}
    </>
  );
}

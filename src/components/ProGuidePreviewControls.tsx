import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/wui/Button";
import { Select } from "@/components/wui/Select";
import { useProGuideStore } from "@/lib/proGuideStore";
import type { AntennaSpot } from "@/lib/nfcAntenna";

type PreviewAntenna = AntennaSpot["kind"];

// Roughly a Pixel 8: one antenna a third of the way down the back.
const SAMPLE_PLACED: AntennaSpot = {
  kind: "placed",
  aspectRatio: 71 / 151,
  points: [{ x: 0.5, y: 0.32 }],
};

const previewSpots: Record<PreviewAntenna, AntennaSpot> = {
  placed: SAMPLE_PLACED,
  topEdge: { kind: "topEdge" },
  broad: { kind: "broad" },
};

/** Dev app preview: opens the Pro guide with a chosen antenna layout. */
export function ProGuidePreviewControls() {
  const { t } = useTranslation();
  const [antenna, setAntenna] = useState<PreviewAntenna>("placed");
  const show = useProGuideStore((state) => state.show);

  return (
    <>
      <Select
        id="pro-guide-preview-antenna"
        label={t("proGuide.preview.antenna")}
        value={antenna}
        onChange={(event) => setAntenna(event.target.value as PreviewAntenna)}
      >
        <option value="placed">{t("proGuide.preview.placed")}</option>
        <option value="topEdge">{t("proGuide.preview.topEdge")}</option>
        <option value="broad">{t("proGuide.preview.broad")}</option>
      </Select>
      <Button
        label={t("proGuide.preview.show")}
        variant="outline"
        onClick={() => show(previewSpots[antenna])}
        className="w-full"
      />
    </>
  );
}

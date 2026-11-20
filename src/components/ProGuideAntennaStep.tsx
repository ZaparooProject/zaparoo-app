import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import { NfcIcon } from "@/lib/images";
import { cancelSession, readTag, Status } from "@/lib/nfc";
import { nfcErrorMessageKey } from "@/lib/nfcErrorMessages";
import { launchFeedback } from "@/lib/launchFeedback";
import { getAntennaSpot, type AntennaSpot } from "@/lib/nfcAntenna";

// A typical phone outline when the OS gives no dimensions.
const DEFAULT_ASPECT_RATIO = 0.47;

function AntennaDiagram({ spot }: { spot: AntennaSpot }) {
  const aspectRatio =
    spot.kind === "placed" ? spot.aspectRatio : DEFAULT_ASPECT_RATIO;

  return (
    <div
      aria-hidden="true"
      data-testid="antenna-diagram"
      data-antenna={spot.kind}
      className="border-border bg-surface-inset relative mx-auto w-28 overflow-hidden rounded-2xl border-2"
      style={{ aspectRatio }}
    >
      {spot.kind === "placed" &&
        spot.points.map((point) => (
          <span
            key={`${point.x}:${point.y}`}
            data-testid="antenna-point"
            className="border-primary bg-primary-wash absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          />
        ))}
      {spot.kind === "topEdge" && (
        <span className="border-primary bg-primary-wash absolute inset-x-0 top-0 h-1/6 border-b-2" />
      )}
      {spot.kind === "broad" && (
        <span className="border-primary bg-primary-wash absolute inset-x-3 top-[12%] h-1/2 rounded-lg border-2" />
      )}
    </div>
  );
}

const hintKey: Record<AntennaSpot["kind"], string> = {
  placed: "proGuide.antennaPlaced",
  topEdge: "proGuide.antennaTopEdge",
  broad: "proGuide.antennaBroad",
};

type ReadResult = { kind: "read" } | { kind: "error"; message: string } | null;

/**
 * Shows where to hold a tag and runs a live read that launches nothing. The
 * read session is stopped when the step is left, the guide closes or the
 * component unmounts.
 */
export function ProGuideAntennaStep({
  active,
  previewAntenna,
}: {
  active: boolean;
  previewAntenna: AntennaSpot | null;
}) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const [detectedSpot, setDetectedSpot] = useState<AntennaSpot | null>(null);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ReadResult>(null);
  const readingRef = useRef(false);
  const mountedRef = useRef(true);
  const spot = previewAntenna ?? detectedSpot;

  useEffect(() => {
    if (previewAntenna) return;
    let cancelled = false;
    void getAntennaSpot().then((found) => {
      if (!cancelled) setDetectedSpot(found);
    });
    return () => {
      cancelled = true;
    };
  }, [previewAntenna]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (readingRef.current) void cancelSession();
    };
  }, []);

  useEffect(() => {
    if (!active && readingRef.current) void cancelSession();
  }, [active]);

  const startRead = async () => {
    if (readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    setResult(null);
    try {
      const outcome = await readTag();
      if (!mountedRef.current) return;
      if (outcome.status === Status.Success) {
        // Android's reader session already buzzes on a read.
        launchFeedback.read("nfc", Capacitor.getPlatform() === "android");
        setResult({ kind: "read" });
        announce(t("proGuide.tagRead"));
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const key = nfcErrorMessageKey(error);
      const message = key ? t(key) : t("scan.scanError");
      setResult({ kind: "error", message });
      announce(message, "assertive");
    } finally {
      readingRef.current = false;
      if (mountedRef.current) setReading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-muted-foreground">
        {spot ? t(hintKey[spot.kind]) : t("proGuide.antennaLoading")}
      </p>
      {spot && <AntennaDiagram spot={spot} />}
      {result?.kind === "read" && (
        <p className="text-success text-center text-sm font-medium">
          {t("proGuide.tagRead")}
        </p>
      )}
      {result?.kind === "error" && (
        <p className="text-error text-center text-sm">{result.message}</p>
      )}
      <ReaderActivityControl
        state={reading ? "waiting" : "idle"}
        idleLabel={
          result?.kind === "read"
            ? t("proGuide.tryAnotherTag")
            : t("proGuide.tryTag")
        }
        activeLabel={t("proGuide.holdTag")}
        icon={<NfcIcon size={20} />}
        onStart={() => void startRead()}
        onCancel={() => void cancelSession()}
        variant="outline"
        intent="default"
        buttonClassName="w-full"
      />
    </div>
  );
}

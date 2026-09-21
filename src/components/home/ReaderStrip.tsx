import { useId } from "react";
import { useTranslation } from "react-i18next";
import { GatedFeature } from "@/components/GatedFeature";
import { ReaderStatusRow } from "@/components/ReaderStatusRow";
import { Card } from "@/components/wui/Card";
import { EmptyState } from "@/components/wui/EmptyState";
import { useReaderStatus } from "@/hooks/useReaderStatus";

interface ReaderStripProps {
  connected: boolean;
}

export function ReaderStrip({ connected }: ReaderStripProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const { readers, holdOwnerReaderId, isPending } = useReaderStatus();

  return (
    <GatedFeature featureId="readers">
      <section aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-muted-foreground mb-2 font-bold capitalize"
        >
          {t("scan.readersHeading")}
        </h2>
        <Card>
          <div className="flex flex-col gap-2">
            {!connected ? (
              <EmptyState size="compact" title={t("settings.notConnected")} />
            ) : isPending ? (
              <span className="text-muted-foreground">{t("loading")}</span>
            ) : readers.length > 0 ? (
              readers.map((reader) => (
                <ReaderStatusRow
                  key={reader.readerId ?? reader.id}
                  name={reader.info || reader.id}
                  connected={reader.connected}
                  detail={reader.scanMode}
                  holdingMedia={
                    holdOwnerReaderId !== undefined &&
                    holdOwnerReaderId === (reader.readerId ?? reader.id)
                  }
                />
              ))
            ) : (
              <EmptyState
                size="compact"
                title={t("settings.readers.noReadersDetected")}
              />
            )}
          </div>
        </Card>
      </section>
    </GatedFeature>
  );
}

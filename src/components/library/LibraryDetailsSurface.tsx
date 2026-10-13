import { useTranslation } from "react-i18next";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";
import { Card } from "@/components/wui/Card";
import { EmptyState } from "@/components/wui/EmptyState";
import type { LibraryMediaSelectionController } from "@/hooks/useLibraryMediaSelection";

export function LibraryDetailsSurface({
  selection,
  systemId,
  deviceKey,
}: {
  selection: LibraryMediaSelectionController;
  systemId: string;
  deviceKey: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      {selection.docked && !selection.isOpen && (
        <Card className="flex min-h-0 w-full items-center justify-center">
          <EmptyState title={t("library.selectMedia")} />
        </Card>
      )}
      <LibraryMediaDetailsModal
        isOpen={selection.isOpen}
        close={selection.close}
        entry={selection.entry}
        systemId={
          selection.result?.system.id || selection.entry?.systemId || systemId
        }
        deviceKey={deviceKey}
        returnOwner={`library:${selection.scope}`}
        docked={selection.docked}
      />
    </>
  );
}

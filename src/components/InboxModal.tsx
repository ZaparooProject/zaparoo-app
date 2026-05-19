import { useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { Bell, Info, OctagonAlert, Trash2, TriangleAlert } from "lucide-react";
import { useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { InboxMessage, InboxSeverity } from "@/lib/models";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";

function severityIcon(severity: InboxSeverity) {
  switch (severity) {
    case InboxSeverity.Error:
      return (
        <OctagonAlert className="text-error" size={20} aria-hidden="true" />
      );
    case InboxSeverity.Warning:
      return (
        <TriangleAlert
          className="text-amber-400"
          size={20}
          aria-hidden="true"
        />
      );
    case InboxSeverity.Info:
    default:
      return <Info className="text-[#3faeec]" size={20} aria-hidden="true" />;
  }
}

function severityKey(severity: InboxSeverity): string {
  switch (severity) {
    case InboxSeverity.Error:
      return "inbox.severity.error";
    case InboxSeverity.Warning:
      return "inbox.severity.warning";
    case InboxSeverity.Info:
    default:
      return "inbox.severity.info";
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function InboxRow(props: { message: InboxMessage; onDelete: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hasBody = !!props.message.body;

  return (
    <div className="border-bd-outline rounded-md border border-solid p-3">
      <div className="flex flex-row items-start gap-3">
        <span aria-label={t(severityKey(props.message.severity))}>
          {severityIcon(props.message.severity)}
        </span>
        <button
          type="button"
          onClick={() => hasBody && setExpanded((prev) => !prev)}
          aria-expanded={hasBody ? expanded : undefined}
          className={classNames(
            "flex flex-1 flex-col gap-1 text-left",
            "focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none",
            { "cursor-default": !hasBody, "cursor-pointer": hasBody },
          )}
        >
          <span className="font-semibold">{props.message.title}</span>
          {hasBody && (
            <span
              className={classNames("text-foreground-hint text-sm", {
                "line-clamp-2": !expanded,
              })}
            >
              {props.message.body}
            </span>
          )}
          <span className="text-foreground-hint text-xs">
            {formatTimestamp(props.message.createdAt)}
          </span>
        </button>
        <Button
          icon={<Trash2 size={18} aria-hidden="true" />}
          variant="text"
          size="sm"
          intent="destructive"
          aria-label={t("inbox.deleteOne")}
          onClick={props.onDelete}
        />
      </div>
    </div>
  );
}

export function InboxModal() {
  const { t } = useTranslation();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const isOpen = useStatusStore((state) => state.inboxModalOpen);
  const setOpen = useStatusStore((state) => state.setInboxModalOpen);
  const messages = useStatusStore((state) => state.inboxMessages);
  const removeInboxMessage = useStatusStore(
    (state) => state.removeInboxMessage,
  );
  const setInboxMessages = useStatusStore((state) => state.setInboxMessages);

  const handleDelete = (id: number) => {
    CoreAPI.inboxDelete({ id })
      .then(() => removeInboxMessage(id))
      .catch((err) => {
        logger.error("Failed to delete inbox message", err, {
          category: "api",
          action: "inbox.delete",
        });
        showRateLimitedErrorToast(
          t("error", { msg: err?.message || "Inbox delete failed" }),
        );
      });
  };

  const handleClearAll = () => {
    CoreAPI.inboxClear()
      .then(() => {
        setInboxMessages([]);
        setConfirmingClear(false);
      })
      .catch((err) => {
        logger.error("Failed to clear inbox", err, {
          category: "api",
          action: "inbox.clear",
        });
        showRateLimitedErrorToast(
          t("error", { msg: err?.message || "Inbox clear failed" }),
        );
      });
  };

  const close = () => {
    setConfirmingClear(false);
    setOpen(false);
  };

  const footer =
    messages.length > 0 ? (
      <div className="flex flex-col gap-2 pt-3">
        {confirmingClear ? (
          <>
            <p className="text-center text-sm">{t("inbox.confirmClear")}</p>
            <div className="flex flex-row gap-2">
              <Button
                label={t("inbox.confirmClearNo")}
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmingClear(false)}
              />
              <Button
                label={t("inbox.confirmClearYes")}
                variant="fill"
                intent="destructive"
                className="flex-1"
                onClick={handleClearAll}
              />
            </div>
          </>
        ) : (
          <Button
            label={t("inbox.clearAll")}
            variant="outline"
            intent="destructive"
            onClick={() => setConfirmingClear(true)}
          />
        )}
      </div>
    ) : undefined;

  return (
    <SlideModal
      isOpen={isOpen}
      close={close}
      title={t("inbox.title")}
      footer={footer}
    >
      {messages.length === 0 ? (
        <EmptyState
          icon={<Bell size={32} aria-hidden="true" />}
          title={t("inbox.empty")}
        />
      ) : (
        <div className="flex flex-col gap-2 py-2">
          {messages.map((message) => (
            <InboxRow
              key={message.id}
              message={message}
              onDelete={() => handleDelete(message.id)}
            />
          ))}
        </div>
      )}
    </SlideModal>
  );
}

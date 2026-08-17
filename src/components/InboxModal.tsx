import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  Bell,
  ChevronDown,
  Info,
  OctagonAlert,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { InboxMessage, InboxSeverity } from "@/lib/models";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { Card } from "@/components/wui/Card";
import { useHapticPress } from "@/hooks/useHapticPress";

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
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function InboxRow(props: { message: InboxMessage; onDelete: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const hasBody = !!props.message.body;
  const handleHapticPress = useHapticPress("light", hasBody);

  const severityLabel = t(severityKey(props.message.severity));
  const messageContent = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-foreground font-semibold">
          {props.message.title}
        </span>
        {hasBody && (
          <span
            id={bodyId}
            aria-hidden={!expanded}
            className={classNames("text-muted-foreground text-sm", {
              "line-clamp-2": !expanded,
            })}
          >
            {props.message.body}
          </span>
        )}
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
          <span>{severityLabel}</span>
          <span aria-hidden="true">•</span>
          <time dateTime={props.message.createdAt}>
            {formatTimestamp(props.message.createdAt)}
          </time>
        </span>
      </span>
      {hasBody && (
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={classNames(
            "text-muted-foreground mt-0.5 shrink-0 transition-transform",
            { "rotate-180": expanded },
          )}
        />
      )}
    </>
  );

  return (
    <Card className="flex flex-row items-start gap-3">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {severityIcon(props.message.severity)}
      </span>
      {hasBody ? (
        <button
          type="button"
          onPointerUp={handleHapticPress}
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="focus-visible:ring-offset-background flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {messageContent}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {messageContent}
        </div>
      )}
      <Button
        icon={<Trash2 size={18} aria-hidden="true" />}
        variant="text"
        size="sm"
        intent="destructive"
        aria-label={t("inbox.deleteOne", { title: props.message.title })}
        onClick={props.onDelete}
        className="-mt-1 -mr-1 shrink-0"
      />
    </Card>
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
          severity: "error",
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
          severity: "error",
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
                variant="outline"
                intent="destructive"
                className="border-error text-error flex-1"
                onClick={handleClearAll}
              />
            </div>
          </>
        ) : (
          <Button
            label={t("inbox.clearAll")}
            variant="outline"
            intent="destructive"
            className="border-error text-error"
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
        <div className="flex flex-col gap-3 py-2">
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

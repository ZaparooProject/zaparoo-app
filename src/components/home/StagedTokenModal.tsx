import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { useStatusStore } from "@/lib/store";

const DEFAULT_LAUNCH_GUARD_TIMEOUT_SECONDS = 15;

function isNoStagedTokenError(error: unknown) {
  return error instanceof Error && error.message.includes("no staged token");
}

export function StagedTokenModal() {
  const { t } = useTranslation();
  const stagedToken = useStatusStore((state) => state.stagedToken);
  const clearStagedToken = useStatusStore((state) => state.clearStagedToken);
  const [confirming, setConfirming] = useState(false);
  const stagedKeyRef = useRef<string | null>(null);
  const stagedStartedAtRef = useRef<number | null>(null);

  const stagedTokenKey = stagedToken
    ? [
        stagedToken.token.type,
        stagedToken.token.uid,
        stagedToken.token.text,
        stagedToken.token.data,
        stagedToken.token.scanTime,
      ].join("\u0000")
    : null;
  const tokenValue = stagedToken?.token.text || stagedToken?.token.uid || "";

  useEffect(() => {
    if (!stagedTokenKey) {
      stagedKeyRef.current = null;
      stagedStartedAtRef.current = null;
      return;
    }

    if (stagedKeyRef.current !== stagedTokenKey) {
      stagedKeyRef.current = stagedTokenKey;
      stagedStartedAtRef.current = Date.now();
    }

    const startedAt = stagedStartedAtRef.current ?? Date.now();
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleExpiry = async () => {
      let timeoutSeconds = DEFAULT_LAUNCH_GUARD_TIMEOUT_SECONDS;
      try {
        const settings = await CoreAPI.settings();
        timeoutSeconds =
          settings.launchGuardTimeout ?? DEFAULT_LAUNCH_GUARD_TIMEOUT_SECONDS;
      } catch (error) {
        logger.warn("Could not load launch guard timeout", error, {
          category: "api",
          action: "tokenStaging.settings",
          severity: "warning",
        });
      }

      if (cancelled || timeoutSeconds <= 0) return;

      const timeoutMs = timeoutSeconds * 1000;
      const remainingMs = Math.max(0, timeoutMs - (Date.now() - startedAt));
      timeoutId = setTimeout(() => {
        clearStagedToken();
      }, remainingMs);
    };

    void scheduleExpiry();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [clearStagedToken, stagedTokenKey]);

  const confirmStagedToken = async () => {
    if (!stagedToken || confirming) return;

    setConfirming(true);
    try {
      await CoreAPI.confirm();
      clearStagedToken();
    } catch (error) {
      const message = isNoStagedTokenError(error)
        ? t("tokenStaging.expiredError")
        : t("tokenStaging.confirmError");
      logger.error(message, error, {
        category: "api",
        action: "tokenStaging.confirm",
        severity: "error",
      });
      if (isNoStagedTokenError(error)) {
        clearStagedToken();
      }
      toast.error(message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SlideModal
      isOpen={stagedToken !== null}
      close={clearStagedToken}
      title={t("tokenStaging.title")}
      fixedHeight="auto"
      footer={
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            label={t("tokenStaging.dismiss")}
            onClick={clearStagedToken}
            className="flex-1"
          />
          <Button
            label={t("tokenStaging.confirm")}
            onClick={confirmStagedToken}
            disabled={!stagedToken || confirming}
            intent="primary"
            className="flex-1"
          />
        </div>
      }
    >
      {stagedToken && (
        <div className="flex flex-col gap-4 py-4">
          <p className="text-muted-foreground text-sm">
            {stagedToken.ready
              ? t("tokenStaging.readyDescription")
              : t("tokenStaging.waitingDescription")}
          </p>

          <p className="text-foreground text-sm font-medium break-all">
            {tokenValue || t("none")}
          </p>
        </div>
      )}
    </SlideModal>
  );
}

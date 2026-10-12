import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { CopyIcon, CheckIcon } from "lucide-react";
import classNames from "classnames";
import { useHaptics } from "@/hooks/useHaptics";
import { writeToClipboard } from "@/lib/clipboard";

export const CopyButton = (props: {
  text: string;
  size?: number;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    },
    [],
  );
  const size = props.size ?? 14;
  const { notification } = useHaptics();

  const handleCopy = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (copied || copyingRef.current) return;
    copyingRef.current = true;
    setCopyError(false);

    try {
      await writeToClipboard(props.text);
      setCopied(true);
      void notification("success");
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      toast.error(t("copyFailed"));
    } finally {
      copyingRef.current = false;
    }
  };

  return (
    <button
      type="button"
      className={classNames(
        "relative inline-flex -translate-y-0.5 align-middle",
        // Compact glyph, 48px hit area.
        "before:absolute before:-inset-[15px] before:content-['']",
        "rounded p-0.5",
        "text-muted-foreground hover:text-foreground",
        "transition-colors duration-150",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        props.className,
      )}
      onClick={handleCopy}
      aria-label={copied ? t("copied") : t("copyToClipboard")}
      style={{ width: size + 4, height: size + 4 }}
    >
      <span className="sr-only" role="status">
        {copyError ? t("copyFailed") : copied ? t("copied") : ""}
      </span>
      <CopyIcon
        aria-hidden="true"
        size={size}
        className={classNames(
          "absolute inset-0 m-auto transition-all duration-200",
          copied ? "scale-75 opacity-0" : "scale-100 opacity-100",
        )}
      />
      <CheckIcon
        aria-hidden="true"
        size={size}
        className={classNames(
          "text-success absolute inset-0 m-auto transition-all duration-200",
          copied ? "scale-100 opacity-100" : "scale-75 opacity-0",
        )}
      />
    </button>
  );
};

import React, { useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";
import { Copy, Check } from "lucide-react";
import classNames from "classnames";

const writeToClipboard = async (s: string) => {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: s });
  } else {
    await navigator.clipboard.writeText(s);
  }
};

export const CopyButton = (props: {
  text: string;
  size?: number;
  className?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const size = props.size ?? 14;

  const handleCopy = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (copied) return;

    try {
      await writeToClipboard(props.text);
    } catch {
      // Clipboard API may fail on web due to permissions, but browser
      // fallbacks often still copy the text. Continue with animation.
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      className={classNames(
        "relative inline-flex align-middle -translate-y-0.5",
        "rounded p-0.5",
        "text-white/60 hover:text-white",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
        props.className
      )}
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      style={{ width: size + 4, height: size + 4 }}
    >
      <Copy
        size={size}
        className={classNames(
          "absolute inset-0 m-auto transition-all duration-200",
          copied ? "opacity-0 scale-75" : "opacity-100 scale-100"
        )}
      />
      <Check
        size={size}
        className={classNames(
          "absolute inset-0 m-auto text-green-400 transition-all duration-200",
          copied ? "opacity-100 scale-100" : "opacity-0 scale-75"
        )}
      />
    </button>
  );
};

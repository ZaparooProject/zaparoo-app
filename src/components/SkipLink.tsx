import { MouseEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

interface SkipLinkProps {
  /** Target element ID to skip to (without #) */
  targetId: string;
  /** Optional custom label (defaults to translated "Skip to main content") */
  label?: string;
}

/**
 * Skip link component for keyboard/screen reader navigation.
 *
 * Allows users to bypass repetitive content (like navigation) and jump
 * directly to main content or other landmarks.
 *
 * The link is visually hidden until focused, then appears prominently.
 *
 * @example
 * // At the top of a page with a long list:
 * <SkipLink targetId="main-content" />
 * <nav>... long navigation ...</nav>
 * <main id="main-content">... content ...</main>
 *
 * @example
 * // Skip past a long list:
 * <SkipLink targetId="after-results" label="Skip search results" />
 * <div>... long list of results ...</div>
 * <div id="after-results" tabIndex={-1}>... content after results ...</div>
 */
export function SkipLink({ targetId, label }: SkipLinkProps) {
  const { t } = useTranslation();
  const displayLabel = label || t("accessibility.skipToContent");

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="focus:bg-primary sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-1/2 focus:z-[100] focus:-translate-x-1/2 focus:rounded-lg focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:ring-2 focus:ring-white/50 focus:outline-none"
    >
      {displayLabel}
    </a>
  );
}

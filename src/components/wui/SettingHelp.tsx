import { useCallback, useMemo, useState, type ReactNode } from "react";
import { HelpCircleIcon } from "lucide-react";
import { SlideModal } from "@/components/SlideModal";

/**
 * Parses simple markdown-like formatting in text.
 * Supports:
 * - **bold** text
 * - Paragraph breaks (double newline)
 */
function parseFormattedText(text: string): ReactNode {
  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map((paragraph, pIndex) => {
    // Parse **bold** within each paragraph
    const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
    const content = parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="text-foreground font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });

    return (
      <p key={pIndex} className={pIndex > 0 ? "mt-3" : undefined}>
        {content}
      </p>
    );
  });
}

interface SettingHelpProps {
  /** The title shown in the dialog header */
  title: string;
  /** The help description text - supports **bold** and paragraph breaks */
  description: string;
  /** Optional aria-label for the help button */
  ariaLabel?: string;
}

export function SettingHelp({
  title,
  description,
  ariaLabel,
}: SettingHelpProps) {
  const [open, setOpen] = useState(false);
  const formattedDescription = useMemo(
    () => parseFormattedText(description),
    [description],
  );
  const close = useCallback(() => setOpen(false), []);

  return (
    <span
      className="inline-flex shrink-0 items-center align-middle"
      role="presentation"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Isolate row activation while letting modal focus/dismissal keys through.
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className="text-foreground-hint hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:ring-ring -my-2 ml-1 inline-flex items-center justify-center rounded-full p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label={ariaLabel ?? `Help for ${title}`}
      >
        <HelpCircleIcon size={18} />
      </button>

      <SlideModal isOpen={open} close={close} title={title}>
        <div className="text-muted-foreground py-2">{formattedDescription}</div>
      </SlideModal>
    </span>
  );
}

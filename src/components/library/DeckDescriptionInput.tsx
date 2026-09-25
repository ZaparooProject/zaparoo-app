import { useId } from "react";
import { useTranslation } from "react-i18next";

export function DeckDescriptionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-1 block">
        {t("decks.description")}
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={1000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-bd-input bg-background text-foreground w-full rounded-md border border-solid p-3 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
      />
    </div>
  );
}

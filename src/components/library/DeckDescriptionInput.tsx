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
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {t("decks.description")}
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={1000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="wui-input border-input bg-surface-inset text-foreground min-h-12 w-full rounded-md border border-solid p-3"
      />
    </div>
  );
}

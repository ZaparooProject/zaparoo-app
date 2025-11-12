import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

interface SimpleSystemSelectProps {
  value: string; // The currently selected system ID (or "all")
  onSelect: (systemId: string) => void;
  placeholder?: string;
  includeAllOption?: boolean;
  className?: string;
}

export function SimpleSystemSelect({
  value,
  onSelect,
  placeholder,
  includeAllOption = false,
  className
}: SimpleSystemSelectProps) {
  const { t } = useTranslation();

  // Get indexing state to disable selector when indexing is in progress
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Fetch systems data
  const { data: systemsData, isLoading } = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  // Group systems by category and sort
  const groupedSystems = (systemsData?.systems || []).reduce(
    (acc, system) => {
      const category = system.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(system);
      return acc;
    },
    {} as Record<string, Array<{ id: string; name: string; category?: string }>>
  );

  // Sort categories alphabetically and systems within each category
  const sortedCategories = Object.entries(groupedSystems)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, systems]) => ({
      category,
      systems: systems.sort((a, b) => a.name.localeCompare(b.name))
    }));

  const handleChange = (e: { target: { value: string } }) => {
    onSelect(e.target.value);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={gamesIndex.indexing || isLoading}
      className={classNames(
        "border-input text-foreground w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:ring-white/20 focus:outline-none",
        {
          "hover:bg-white/10": !gamesIndex.indexing && !isLoading,
          "opacity-50 cursor-not-allowed": gamesIndex.indexing || isLoading
        },
        className
      )}
      style={{ backgroundColor: "var(--color-background)" }}
    >
      {placeholder && <option value="">{placeholder}</option>}

      {includeAllOption && (
        <option value="all">{t("systemSelector.allSystems")}</option>
      )}

      {isLoading ? (
        <option disabled>{t("loading")}</option>
      ) : (
        sortedCategories.map(({ category, systems }) => (
          <optgroup key={category} label={category}>
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </optgroup>
        ))
      )}
    </select>
  );
}

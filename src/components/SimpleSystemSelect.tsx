import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { systemHasIndexedMedia } from "@/lib/systemFilters";
import { compareStrings } from "@/lib/utils";
import { useSystemsWithDisplayNames } from "@/hooks/useSystemName";

interface SimpleSystemSelectProps {
  value: string; // The currently selected system ID (or "all")
  onSelect: (systemId: string) => void;
  placeholder?: string;
  includeAllOption?: boolean;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function SimpleSystemSelect({
  value,
  onSelect,
  placeholder,
  includeAllOption = false,
  className,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SimpleSystemSelectProps) {
  const { t } = useTranslation();
  const targetDeviceAddress = useStatusStore(
    (state) => state.targetDeviceAddress,
  );

  // Fetch systems data
  const { data: systemsData, isLoading } = useQuery({
    queryKey: ["systems", targetDeviceAddress, { all: false }],
    queryFn: () => CoreAPI.systems(),
    enabled: !disabled,
    staleTime: 0,
  });

  const catalogSystems = useMemo(
    () => systemsData?.systems ?? [],
    [systemsData?.systems],
  );
  const displaySystems = useSystemsWithDisplayNames(catalogSystems).filter(
    (system) => system.id === value || systemHasIndexedMedia(system),
  );

  // Group systems by category and sort
  const groupedSystems = displaySystems.reduce(
    (acc, system) => {
      const category = system.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(system);
      return acc;
    },
    {} as Record<
      string,
      Array<{ id: string; name: string; category?: string }>
    >,
  );

  // Sort categories alphabetically and systems within each category
  const sortedCategories = Object.entries(groupedSystems)
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([category, systems]) => ({
      category,
      systems: systems.sort((a, b) => compareStrings(a.name, b.name)),
    }));

  const handleChange = (e: { target: { value: string } }) => {
    onSelect(e.target.value);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={classNames(
        "border-input text-foreground w-full rounded-md border px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
        {
          "hover:bg-white/10": !disabled && !isLoading,
          "cursor-not-allowed opacity-50": disabled || isLoading,
        },
        className,
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

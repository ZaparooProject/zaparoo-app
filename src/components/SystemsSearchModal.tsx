import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CoreAPI } from "@/lib/coreApi.ts";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { TextInput } from "@/components/wui/TextInput.tsx";

export function SystemsSearchModal(props: {
  isOpen: boolean;
  close: () => void;
  onSelect: (systemId: string) => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [filterText, setFilterText] = useState("");

  const systems = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  // Group systems by category and filter by name
  const groupedSystems =
    systems.data?.systems.reduce(
      (acc, system) => {
        if (!system.name.toLowerCase().includes(filterText.toLowerCase())) {
          return acc;
        }

        const category = system.category || "Other";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(system);
        return acc;
      },
      {} as Record<string, typeof systems.data.systems>
    ) ?? {};

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("create.custom.selectSystem")}
      scrollRef={containerRef}
    >
      <div className="flex flex-col">
        <div className="sticky top-0 z-20 bg-[#111928] px-1 pb-2 pt-2">
          <TextInput
            placeholder={t("create.search.systemInput")}
            value={filterText}
            setValue={setFilterText}
            type="search"
            className="mb-3"
          />
        </div>

        <div className="flex-1 px-4">
          {systems.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <span>{t("loading")}</span>
            </div>
          ) : systems.error ? (
            <div className="flex h-full items-center justify-center">
              <span>{t("error")}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {Object.entries(groupedSystems)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, categorySystems]) => (
                  <div
                    key={category}
                    id={`category-${category}`}
                    className="flex flex-col gap-2"
                  >
                    <div className="text-sm font-medium text-muted-foreground">
                      {category}
                    </div>
                    <div className="flex flex-col gap-2">
                      {categorySystems
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((system) => (
                          <Button
                            key={system.id}
                            label={`${system.name}`}
                            variant="outline"
                            onClick={() => {
                              props.onSelect(system.id);
                              props.close();
                            }}
                            className="touch-manipulation"
                          />
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </SlideModal>
  );
}

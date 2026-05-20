import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { BackIcon } from "@/lib/images.tsx";
import { HeaderButton } from "@/components/wui/HeaderButton.tsx";
import { CoreAPI } from "@/lib/coreApi.ts";
import { useStatusStore } from "@/lib/store.ts";
import { logger } from "@/lib/logger";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { PageFrame } from "@/components/PageFrame";
import { MappingRow } from "@/components/MappingRow";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

export const Route = createFileRoute("/create/mappings")({
  component: Mappings,
});

function Mappings() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("create.mappings.title"));
  const connected = useStatusStore((state) => state.connected);
  const router = useRouter();
  const navigate = useNavigate();
  const goBack = () => router.history.back();
  const [search, setSearch] = useState("");
  const [reloading, setReloading] = useState(false);

  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const mappings = useQuery({
    queryKey: ["mappings"],
    queryFn: () => CoreAPI.mappings(),
  });

  const sortedMappings = useMemo(() => {
    const list = mappings.data?.mappings ?? [];
    return [...list].sort((a, b) => {
      const aKey = (a.label || a.pattern || "").toLowerCase();
      const bKey = (b.label || b.pattern || "").toLowerCase();
      return aKey.localeCompare(bKey);
    });
  }, [mappings.data]);

  const filteredMappings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") return sortedMappings;
    return sortedMappings.filter((m) => {
      return (
        m.label.toLowerCase().includes(query) ||
        m.pattern.toLowerCase().includes(query) ||
        m.override.toLowerCase().includes(query)
      );
    });
  }, [sortedMappings, search]);

  const goToNew = () => {
    navigate({ to: "/create/mappings/new" });
  };

  const goToEdit = (id: string) => {
    navigate({
      to: "/create/mappings/edit/$id",
      params: { id },
    });
  };

  const reloadConfig = async () => {
    if (!connected || reloading) return;
    setReloading(true);
    try {
      await CoreAPI.mappingsReload();
      toast.success(t("create.mappings.list.reloadedSuccess"));
      await mappings.refetch();
    } catch (error) {
      logger.error("Failed to reload mappings", error, {
        category: "api",
        action: "mappingsReload",
      });
      toast.error(t("create.mappings.list.reloadFailed"));
    } finally {
      setReloading(false);
    }
  };

  const isEmpty = !mappings.isLoading && sortedMappings.length === 0;

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 className="text-foreground text-xl">
          {t("create.mappings.title")}
        </h1>
      }
      headerRight={
        <HeaderButton
          onClick={reloadConfig}
          icon={<RefreshCwIcon size={24} />}
          aria-label={t("create.mappings.list.reload")}
          disabled={!connected || reloading}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {isEmpty ? (
          <EmptyState
            title={t("create.mappings.list.empty")}
            description={t("create.mappings.list.emptyDescription")}
            action={
              <Button
                icon={<PlusIcon size={20} />}
                label={t("create.mappings.list.newMapping")}
                intent="primary"
                onClick={goToNew}
              />
            }
          />
        ) : (
          <>
            {sortedMappings.length > 0 && (
              <TextInput
                value={search}
                setValue={setSearch}
                placeholder={t("create.mappings.list.searchPlaceholder")}
                clearable
                inputMode="search"
                type="search"
              />
            )}
            <Button
              icon={<PlusIcon size={20} />}
              label={t("create.mappings.list.newMapping")}
              intent="primary"
              onClick={goToNew}
              className="w-full"
            />
            {filteredMappings.length === 0 ? (
              <EmptyState
                size="compact"
                title={t("create.mappings.list.searchEmpty")}
              />
            ) : (
              <div className="flex flex-col">
                {filteredMappings.map((mapping, i) => (
                  <MappingRow
                    key={mapping.id}
                    mapping={mapping}
                    onTap={() => goToEdit(mapping.id)}
                    isLast={i === filteredMappings.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageFrame>
  );
}

import { useTranslation } from "react-i18next";
import type { PageBreadcrumb } from "@/components/PageFrame";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";

/**
 * Ancestor breadcrumbs for pages under the Library's Collections view
 * (collections and decks): Library, then Collections. Both lead to the Library
 * root; Collections also selects that view, as its sidebar entry does.
 */
export function useLibraryCollectionBreadcrumbs(
  onNavigate?: () => void,
): PageBreadcrumb[] {
  const { t } = useTranslation();
  const showView = useLibrarySessionStore((state) => state.showView);
  const deviceKey = useActiveDeviceKey();
  return [
    { to: "/library", label: t("library.title"), onNavigate },
    {
      to: "/library",
      label: t("library.collections"),
      onNavigate: () => {
        showView(deviceKey, "collections");
        onNavigate?.();
      },
    },
  ];
}

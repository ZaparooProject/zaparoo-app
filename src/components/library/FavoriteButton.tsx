import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMediaPreferences } from "@/components/library/useMediaPreferences";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { Button, type ButtonLayout } from "@/components/wui/Button";

export function FavoriteButton(props: {
  entry: MediaBrowseEntry;
  fallbackSystemId: string;
  deviceKey: string;
  metadataTags?: TagInfo[];
  className?: string;
  iconOnly?: boolean;
  displayLabel?: string;
  layout?: ButtonLayout;
  variant?: "fill" | "outline" | "text";
}) {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const feature = useCoreFeature("mediaFavorites", {
    requireKnownSupport: true,
  });
  const { flags, isPending, busy, canUpdate, toggle } =
    useMediaPreferences(props);
  const favoriteLabel = t(
    flags.favorite ? "library.removeFavorite" : "library.addFavorite",
  );
  const actionLabel = isPending ? t("library.updatingFavorite") : favoriteLabel;

  return (
    <Button
      label={props.iconOnly ? undefined : (props.displayLabel ?? favoriteLabel)}
      aria-label={actionLabel}
      icon={<Heart size={20} fill={flags.favorite ? "currentColor" : "none"} />}
      variant={props.variant ?? "outline"}
      size={props.iconOnly ? "lg" : "default"}
      layout={props.layout}
      aria-pressed={flags.favorite}
      disabled={!feature.available || !connected || !canUpdate || busy}
      onClick={() => toggle("favorite")}
      className={props.className ?? (props.iconOnly ? undefined : "w-full")}
    />
  );
}

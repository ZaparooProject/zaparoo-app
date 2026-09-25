import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { CoreAPI } from "@/lib/coreApi";
import { refreshDecks } from "@/lib/decks";
import { logger } from "@/lib/logger";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { useStatusStore } from "@/lib/store";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { TextInput } from "@/components/wui/TextInput";
import { DeckDescriptionInput } from "@/components/library/DeckDescriptionInput";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { BackIcon } from "@/lib/images";

export const Route = createFileRoute("/library/decks/new")({
  component: NewDeck,
});

export function NewDeck({
  backTo = "/library",
}: {
  backTo?: "/library" | "/create";
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deviceKey = useActiveDeviceKey();
  const connected = useStatusStore((state) => state.connected);
  const feature = useCoreFeature("decks", { requireKnownSupport: true });
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(t("decks.new"));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const goBack = () => void navigate(appBackNavigationOptions(backTo));

  const save = async () => {
    if (!connected || !feature.available || !name.trim() || saving) return;
    setSaving(true);
    try {
      const deck = await CoreAPI.deckNew({
        name: name.trim(),
        description: description.trim(),
      });
      await refreshDecks(queryClient, deviceKey, deck);
      void navigate({
        to: "/library/decks/$deckId",
        params: { deckId: deck.deckId },
        replace: true,
      });
    } catch (error) {
      logger.error("Failed to create deck", error, {
        category: "api",
        action: "deckNew",
      });
      toast.error(t("decks.createError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageFrame
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("decks.new")}
        </h1>
      }
    >
      {!connected ? (
        <EmptyState title={t("library.disconnected")} />
      ) : !feature.available ? (
        <EmptyState
          title={t("library.updateCore")}
          description={t("features.requiresCoreVersion", {
            version: feature.requiredVersion,
          })}
        />
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextInput
            label={t("decks.name")}
            value={name}
            setValue={setName}
            maxLength={100}
            required
          />
          <DeckDescriptionInput value={description} onChange={setDescription} />
          <Button
            label={t("decks.create")}
            intent="primary"
            className="w-full"
            disabled={!name.trim() || saving}
          />
        </form>
      )}
    </PageFrame>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { CoreAPI, isTransientApiConnectionError } from "@/lib/coreApi";
import { canEditDeck, MAX_DECK_ITEMS, refreshDecks } from "@/lib/decks";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { logger } from "@/lib/logger";
import { useStatusStore } from "@/lib/store";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { EmptyState } from "@/components/wui/EmptyState";
import { TextInput } from "@/components/wui/TextInput";
import { Segmented } from "@/components/wui/Segmented";
import { Button } from "@/components/wui/Button";
import { ZapScriptInput } from "@/components/ZapScriptInput";
import { BackIcon } from "@/lib/images";

export const Route = createFileRoute("/library/decks/$deckId_/add")({
  component: AddDeckItem,
});

export function AddDeckItem() {
  const { deckId } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deviceKey = useActiveDeviceKey();
  const connected = useStatusStore((state) => state.connected);
  const feature = useCoreFeature("decks", { requireKnownSupport: true });
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("decks.addCustom"),
  );
  const deckQuery = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.decks, deviceKey, deckId],
    queryFn: ({ signal }) => CoreAPI.deckGet(deckId, signal),
    enabled: connected && Boolean(deviceKey) && feature.available,
    retry: (failureCount, error) =>
      failureCount < 1 && isTransientApiConnectionError(error),
  });
  const deck = deckQuery.data;
  const [kind, setKind] = useState<"script" | "card">("script");
  const [name, setName] = useState("");
  const [script, setScript] = useState("");
  const [cardId, setCardId] = useState("");
  const [saving, setSaving] = useState(false);
  const goBack = () =>
    void navigate({
      to: "/library/decks/$deckId",
      params: { deckId },
      resetScroll: false,
    });

  const save = async () => {
    if (
      !connected ||
      !deck ||
      !canEditDeck(deck) ||
      deck.itemCount >= MAX_DECK_ITEMS ||
      saving ||
      (kind === "script" ? !name.trim() || !script.trim() : !cardId.trim())
    )
      return;
    setSaving(true);
    try {
      const updated = await CoreAPI.deckUpdate({
        deckId,
        addItems: [
          kind === "card"
            ? { kind: "card", cardId: cardId.trim() }
            : { kind: "script", name: name.trim(), zapscript: script.trim() },
        ],
      });
      await refreshDecks(queryClient, deviceKey, updated);
      void navigate({
        to: "/library/decks/$deckId",
        params: { deckId },
        resetScroll: false,
        replace: true,
      });
    } catch (error) {
      logger.error("Failed to add custom deck item", error, {
        category: "api",
        action: "deckAddItem",
      });
      toast.error(t("decks.updateError"));
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
          {t("decks.addCustom")}
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
      ) : deckQuery.isLoading ? (
        <p role="status" className="text-muted-foreground">
          {t("decks.loading")}
        </p>
      ) : deckQuery.isError || !deck ? (
        <EmptyState
          title={t("decks.loadError")}
          action={
            <Button
              label={t("library.tryAgain")}
              variant="outline"
              onClick={() => void deckQuery.refetch()}
            />
          }
        />
      ) : !canEditDeck(deck) ? (
        <EmptyState
          title={t(deck.locked ? "decks.locked" : "decks.readOnly")}
        />
      ) : deck.itemCount >= MAX_DECK_ITEMS ? (
        <EmptyState title={t("decks.full")} />
      ) : (
        <div className="flex flex-col gap-4">
          <Segmented
            label={t("decks.itemType")}
            options={[
              { value: "script", label: t("decks.script") },
              { value: "card", label: t("decks.card") },
            ]}
            value={kind}
            onChange={setKind}
          />
          {kind === "script" ? (
            <>
              <TextInput
                label={t("decks.itemName")}
                value={name}
                setValue={setName}
                maxLength={100}
              />
              <ZapScriptInput
                value={script}
                setValue={setScript}
                aria-label={t("decks.script")}
              />
            </>
          ) : (
            <TextInput
              label={t("decks.cardId")}
              value={cardId}
              setValue={setCardId}
              maxLength={64}
            />
          )}
          <div className="flex gap-2">
            <Button
              label={t("nav.cancel")}
              variant="outline"
              className="flex-1"
              onClick={goBack}
            />
            <Button
              label={t("decks.addItem")}
              intent="primary"
              className="flex-1"
              disabled={
                saving ||
                (kind === "script"
                  ? !name.trim() || !script.trim()
                  : !cardId.trim())
              }
              onClick={() => void save()}
            />
          </div>
        </div>
      )}
    </PageFrame>
  );
}

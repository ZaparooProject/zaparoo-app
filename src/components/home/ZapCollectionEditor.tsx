import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/wui/Button";
import { Select } from "@/components/wui/Select";
import { TextInput } from "@/components/wui/TextInput";
import { ZAP_COLLECTION_LABELS } from "@/lib/zapCollections";
import { useEditorBar } from "@/components/home/useEditorBar";
import { useZapDecks } from "@/hooks/useZapDecks";
import {
  ZAP_COLLECTIONS,
  type ZapCollection,
  type ZapCollectionName,
  type ZapCollectionSource,
} from "@/lib/zapLayout";

const COLLECTION_PREFIX = "collection:";
const DECK_PREFIX = "deck:";

const toValue = (source: ZapCollectionSource) =>
  source.kind === "deck"
    ? `${DECK_PREFIX}${source.deckId}`
    : `${COLLECTION_PREFIX}${source.collection}`;

const fromValue = (value: string): ZapCollectionSource =>
  value.startsWith(DECK_PREFIX)
    ? { kind: "deck", deckId: value.slice(DECK_PREFIX.length) }
    : {
        kind: "collection",
        collection: value.slice(COLLECTION_PREFIX.length) as ZapCollectionName,
      };

interface ZapCollectionEditorProps {
  collection: ZapCollection;
  isNew: boolean;
  onSave: (collection: ZapCollection) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/**
 * Where a collection row is made and changed: which collection or deck it
 * shows, and optionally what its heading says. Like the button editor it takes
 * the place of the layout editor rather than opening over it.
 */
export function ZapCollectionEditor({
  collection,
  isNew,
  onSave,
  onDelete,
  onClose,
}: ZapCollectionEditorProps) {
  const { t } = useTranslation();
  const { rootRef } = useEditorBar();
  const titleId = useId();
  const { available: decksAvailable, decks } = useZapDecks();
  const [draft, setDraft] = useState(collection);
  const selected = toValue(draft.source);
  const { source } = draft;
  const deckId = source.kind === "deck" ? source.deckId : null;
  const knownDeck =
    deckId === null || decks.some((deck) => deck.deckId === deckId);
  const sourceName =
    source.kind === "deck"
      ? (decks.find((deck) => deck.deckId === deckId)?.name ?? "")
      : t(ZAP_COLLECTION_LABELS[source.collection]);

  return (
    <div
      ref={rootRef}
      className="zap-editor"
      role="region"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-foreground text-xl">
        {t(
          isNew
            ? "zapLayout.addCollectionTitle"
            : "zapLayout.editCollectionTitle",
        )}
      </h2>
      <div className="zap-editor-body zap-collection-form">
        <Select
          label={t("zapLayout.collectionSource")}
          value={selected}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              source: fromValue(event.target.value),
            }))
          }
        >
          <optgroup label={t("zapLayout.collectionGroup")}>
            {ZAP_COLLECTIONS.map((name) => (
              <option key={name} value={`${COLLECTION_PREFIX}${name}`}>
                {t(ZAP_COLLECTION_LABELS[name])}
              </option>
            ))}
          </optgroup>
          {(decksAvailable || deckId !== null) && (
            <optgroup label={t("zapLayout.deckGroup")}>
              {!knownDeck && (
                <option value={selected}>{t("zapLayout.deckMissing")}</option>
              )}
              {decks.map((deck) => (
                <option
                  key={deck.deckId}
                  value={`${DECK_PREFIX}${deck.deckId}`}
                >
                  {deck.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>

        <TextInput
          label={t("zapLayout.collectionTitle")}
          placeholder={sourceName}
          value={draft.title}
          setValue={(title) => setDraft((current) => ({ ...current, title }))}
          maxLength={40}
        />

        <div className="zap-form-actions">
          <Button
            intent="primary"
            className="w-full"
            label={t("save")}
            onClick={() => onSave({ ...draft, title: draft.title.trim() })}
          />
          <Button
            variant="secondary"
            className="w-full"
            label={t("zapLayout.cancel")}
            onClick={onClose}
          />
        </div>
        {!isNew && (
          <div className="zap-form-delete">
            <Button
              variant="outline"
              intent="destructive"
              className="w-full"
              label={t("zapLayout.deleteCollection")}
              onClick={() => onDelete(collection.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

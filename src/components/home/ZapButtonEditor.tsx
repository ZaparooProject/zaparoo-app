import { useId, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/wui/Button";
import { Select } from "@/components/wui/Select";
import { TextInput } from "@/components/wui/TextInput";
import { ToggleChip } from "@/components/wui/ToggleChip";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { ZapScriptInput } from "@/components/ZapScriptInput";
import { ZapButtonFace } from "@/components/home/ZapButtonWidget";
import { ZAP_BUTTON_ICON_COMPONENTS } from "@/components/home/zapButtonIcons";
import { useEditorBar } from "@/components/home/useEditorBar";
import { suggestZapButton } from "@/lib/zapButtonDefaults";
import {
  ZAP_BUTTON_ICONS,
  ZAP_BUTTON_SIZES,
  ZAP_BUTTON_STYLES,
  zapButtonSpan,
  type ZapButton,
  type ZapButtonSize,
  type ZapButtonStyle,
} from "@/lib/zapLayout";

interface ZapButtonEditorProps {
  button: ZapButton;
  isNew: boolean;
  onSave: (button: ZapButton) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/**
 * Where a custom button is made and changed. It takes the place of the layout
 * editor rather than opening over it, because ZapScript's pickers are dialogs
 * and a dialog opened over a dialog closes it, losing what has been entered.
 */
export function ZapButtonEditor({
  button,
  isNew,
  onSave,
  onDelete,
  onClose,
}: ZapButtonEditorProps) {
  const { t } = useTranslation();
  const { rootRef } = useEditorBar();
  const titleId = useId();
  const scriptLabelId = useId();
  const optionsId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [draft, setDraft] = useState(button);
  // A new button is named and drawn from what it does until the user chooses
  // otherwise; one being changed keeps what it was given.
  const [iconChosen, setIconChosen] = useState(!isNew);
  const update = (changes: Partial<ZapButton>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const suggestion = suggestZapButton(draft.script, (key) => t(key));
  const shown: ZapButton = {
    ...draft,
    label: draft.label.trim() || suggestion.label,
    icon: iconChosen ? draft.icon : suggestion.icon,
  };
  const complete =
    draft.script.trim() !== "" && (shown.label !== "" || shown.icon !== "");

  return (
    <div
      ref={rootRef}
      className="zap-editor"
      role="region"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-foreground text-xl">
        {t(isNew ? "zapLayout.addButtonTitle" : "zapLayout.editButtonTitle")}
      </h2>
      <div className="zap-editor-body zap-button-form">
        <div className="zap-button-form-script">
          <span id={scriptLabelId} className="text-sm font-medium">
            {t("zapLayout.buttonScript")}
          </span>
          <ZapScriptInput
            value={draft.script}
            setValue={(script) => update({ script })}
            rows={4}
            aria-labelledby={scriptLabelId}
          />
        </div>

        <div className="zap-button-form-basics">
          <TextInput
            label={t("zapLayout.buttonLabel")}
            placeholder={suggestion.label}
            value={draft.label}
            setValue={(label) => update({ label })}
            maxLength={40}
          />

          <div className="bg-surface-inset rounded-md p-3" aria-hidden="true">
            <div
              className="mx-auto"
              style={{
                width: `${(zapButtonSpan(draft) / 12) * 100}%`,
                minWidth: "7rem",
              }}
              inert
            >
              <ZapButtonFace
                button={{
                  ...shown,
                  // Nothing to draw yet: show what an unnamed button is called.
                  label:
                    shown.label ||
                    (shown.icon ? "" : t("zapLayout.buttonUnnamed")),
                }}
              />
            </div>
          </div>
        </div>

        <div className="zap-button-form-more">
          <div>
            <Button
              variant="text"
              size="sm"
              label={t("zapLayout.moreOptions")}
              icon={
                moreOpen ? (
                  <ChevronUpIcon size={20} />
                ) : (
                  <ChevronDownIcon size={20} />
                )
              }
              aria-expanded={moreOpen}
              aria-controls={optionsId}
              onClick={() => setMoreOpen(!moreOpen)}
            />
          </div>
          {moreOpen && (
            <div id={optionsId} className="flex flex-col gap-5">
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="text-sm font-medium">
                  {t("zapLayout.buttonIcon")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  <ToggleChip
                    label={t("zapLayout.iconNone")}
                    state={shown.icon === ""}
                    setState={() => {
                      setIconChosen(true);
                      update({ icon: "" });
                    }}
                    compact
                  />
                  {ZAP_BUTTON_ICONS.map((name) => {
                    const Icon = ZAP_BUTTON_ICON_COMPONENTS[name];
                    return (
                      <ToggleChip
                        key={name}
                        icon={<Icon size={20} />}
                        shape="square"
                        aria-label={t(`zapLayout.icons.${name}`)}
                        state={shown.icon === name}
                        setState={() => {
                          setIconChosen(true);
                          update({ icon: name });
                        }}
                      />
                    );
                  })}
                </div>
              </fieldset>
              <Select
                label={t("zapLayout.buttonSize")}
                value={draft.size}
                onChange={(event) =>
                  update({ size: event.target.value as ZapButtonSize })
                }
              >
                {ZAP_BUTTON_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {t(`zapLayout.sizes.${size}`)}
                  </option>
                ))}
              </Select>
              <Select
                label={t("zapLayout.buttonStyle")}
                value={draft.style}
                onChange={(event) =>
                  update({ style: event.target.value as ZapButtonStyle })
                }
              >
                {ZAP_BUTTON_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {t(`zapLayout.styles.${style}`)}
                  </option>
                ))}
              </Select>
              <ToggleSwitch
                label={t("zapLayout.askFirst")}
                value={draft.confirm}
                setValue={(confirm) => update({ confirm })}
                reflow
              />
            </div>
          )}
        </div>

        {/* On a phone Save stays on screen however far the form is scrolled. */}
        <div className="zap-form-actions zap-form-actions-pinned">
          <Button
            intent="primary"
            className="w-full"
            label={t("save")}
            disabled={!complete}
            onClick={() =>
              onSave({
                ...draft,
                label: shown.label,
                icon: shown.icon,
              })
            }
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
              label={t("zapLayout.deleteButton")}
              onClick={() => onDelete(button.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { SearchIcon } from "@/lib/images";
import { zapCommand } from "@/lib/zapscript/catalog";
import {
  createZapStep,
  serializeZapStep,
  type ZapStep,
} from "@/lib/zapscript/script";
import type {
  ZapAdvArgSpec,
  ZapArgSpec,
  ZapCommandSpec,
} from "@/lib/zapscript/types";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { Select } from "@/components/wui/Select";
import { TextInput } from "@/components/wui/TextInput";
import { CommandsModal } from "@/components/CommandsModal";
import { MediaSearchModal } from "@/components/MediaSearchModal";
import { SystemSelector } from "@/components/SystemSelector";
import { LauncherSelector } from "@/components/LauncherSelector";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useStatusStore } from "@/lib/store";

// One icon for all three: each button looks up a value for its field.
const PICKERS = {
  media: "zapscript.builder.searchMediaFor",
  system: "zapscript.builder.chooseSystemFor",
  launcher: "zapscript.builder.chooseLauncherFor",
};
type PickerKind = keyof typeof PICKERS;

/** A field waiting on the media search, system picker or launcher list. */
type PickerTarget = {
  kind: PickerKind;
  apply: (value: string) => void;
};

/**
 * A command the catalogue has a form for. Anything else (an unknown command,
 * or more arguments than the form has fields) is edited as text.
 */
function formFor(step: ZapStep): ZapCommandSpec | null {
  if (step.raw) return null;
  const spec = zapCommand(step.name);
  if (!spec || step.args.length > spec.args.length) return null;
  // A single-line field would silently drop a line break or tab.
  const values = [...step.args, ...step.advArgs.map(([, value]) => value)];
  if (values.some((value) => /[\n\r\t]/.test(value))) return null;
  return spec;
}

/** An edited copy: the step no longer matches the text it was read from. */
const edit = (step: ZapStep, changes: Partial<ZapStep>): ZapStep => ({
  ...step,
  ...changes,
  source: undefined,
});

function ValueField({
  spec,
  value,
  disabled,
  connected,
  onChange,
  onPick,
}: {
  spec: Pick<ZapArgSpec, "label" | "example" | "options"> & {
    kind: ZapArgSpec["kind"] | ZapAdvArgSpec["kind"];
    required?: boolean;
  };
  value: string;
  disabled: boolean;
  connected: boolean;
  onChange: (value: string) => void;
  onPick: (target: PickerTarget) => void;
}) {
  const { t } = useTranslation();
  const launchers = useCoreFeature("launchers", { requireKnownSupport: true });
  const label = t(spec.label);

  if (spec.kind === "choice") {
    return (
      <Select
        label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!spec.required && (
          <option value="">{t("zapscript.builder.noChoice")}</option>
        )}
        {/* A value read from the script stays selectable even if unlisted. */}
        {[
          ...(spec.options ?? []),
          ...(value && !spec.options?.includes(value) ? [value] : []),
        ].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    );
  }

  const input = (
    <TextInput
      className="min-w-0 flex-1"
      label={label}
      value={value}
      setValue={onChange}
      placeholder={spec.example}
      disabled={disabled}
      inputMode={spec.kind === "number" ? "numeric" : undefined}
      required={spec.required}
    />
  );
  const kind = spec.kind;
  if (kind !== "media" && kind !== "system" && kind !== "launcher") {
    return input;
  }
  // Older Cores cannot list their launchers; the ID is typed instead.
  if (kind === "launcher" && connected && !launchers.available) return input;

  return (
    <div className="flex min-w-0 items-end gap-2">
      {input}
      <Button
        variant="outline"
        shape="square"
        icon={<SearchIcon size="20" />}
        aria-label={t(PICKERS[kind], { field: label })}
        disabled={disabled || !connected}
        onClick={() => onPick({ kind, apply: onChange })}
      />
    </div>
  );
}

function StepCard({
  step,
  position,
  count,
  disabled,
  connected,
  onChange,
  onMove,
  onRemove,
  onPick,
}: {
  step: ZapStep;
  position: number;
  count: number;
  disabled: boolean;
  connected: boolean;
  onChange: (step: ZapStep) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onPick: (target: PickerTarget) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const movedRef = useRef<-1 | 1 | null>(null);
  // Moving re-inserts the card and can disable the pressed arrow, which drops
  // focus; keep it on this card's arrows so keyboard users can keep moving.
  useEffect(() => {
    const moved = movedRef.current;
    if (!moved) return;
    movedRef.current = null;
    const preferred = moved === -1 ? upRef.current : downRef.current;
    const fallback = moved === -1 ? downRef.current : upRef.current;
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [position]);
  const spec = formFor(step);
  const [optionsOpen, setOptionsOpen] = useState(step.advArgs.length > 0);
  const title = spec ? spec.name : t("zapscript.builder.textStep");
  const corePlatform = useStatusStore((state) => state.corePlatform);
  // Options edited in this card keep their field while it is open, even once
  // emptied: an empty option is dropped from the script, and the field it was
  // typed in must not vanish under the user's hands.
  const [editedOptions, setEditedOptions] = useState<string[]>([]);
  const setsOption = (name: string) =>
    step.advArgs.some(([key]) => key === name) || editedOptions.includes(name);
  const onPlatform = (adv: ZapAdvArgSpec) =>
    !adv.platform ||
    (connected && corePlatform?.trim().toLowerCase() === adv.platform) ||
    // Never hide an option the script already sets.
    setsOption(adv.name);
  // Options the script names but the catalogue does not are still editable.
  const advSpecs: ZapAdvArgSpec[] = spec
    ? [
        ...(spec.advArgs ?? []).filter(onPlatform),
        ...[
          ...new Set([...step.advArgs.map(([name]) => name), ...editedOptions]),
        ]
          .filter((name) => !spec.advArgs?.some((adv) => adv.name === name))
          // Its own name is the only label there is.
          .map((name) => ({ name, label: name, kind: "text" as const })),
      ]
    : [];
  const setArg = (index: number, value: string) => {
    const args = spec!.args.map((_, i) => step.args[i] ?? "");
    args[index] = value;
    onChange(edit(step, { args }));
  };
  const setAdvArg = (name: string, value: string) => {
    setEditedOptions((current) =>
      current.includes(name) ? current : [...current, name],
    );
    // An edited option keeps its place; a new one goes last.
    const known = step.advArgs.some(([key]) => key === name);
    const advArgs: ZapStep["advArgs"] = known
      ? step.advArgs.map(([key, current]) => [
          key,
          key === name ? value : current,
        ])
      : [...step.advArgs, [name, value]];
    onChange(edit(step, { advArgs: advArgs.filter(([, v]) => v !== "") }));
  };

  return (
    <li
      className="zapscript-step"
      aria-label={t("zapscript.builder.stepLabel", { position, name: title })}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
          <span className="font-semibold">
            {spec ? t(spec.description) : t("zapscript.builder.textStep")}
          </span>
          <span
            className={
              spec
                ? "text-muted-foreground font-mono text-sm break-words"
                : "text-muted-foreground text-sm"
            }
          >
            {spec ? spec.name : t("zapscript.builder.textStepDescription")}
          </span>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            icon={<ArrowUpIcon size={20} />}
            variant="ghost"
            aria-label={t("zapscript.builder.moveUp", { position })}
            ref={upRef}
            disabled={disabled || position === 1}
            onClick={() => {
              movedRef.current = -1;
              onMove(-1);
            }}
          />
          <Button
            icon={<ArrowDownIcon size={20} />}
            variant="ghost"
            aria-label={t("zapscript.builder.moveDown", { position })}
            ref={downRef}
            disabled={disabled || position === count}
            onClick={() => {
              movedRef.current = 1;
              onMove(1);
            }}
          />
          <Button
            icon={<Trash2Icon size={20} />}
            variant="ghost"
            intent="destructive"
            aria-label={t("zapscript.builder.remove", { position })}
            disabled={disabled}
            onClick={onRemove}
          />
        </div>
      </div>

      {spec ? (
        <>
          {spec.args.length > 0 && (
            <div className="zapscript-step-fields">
              {spec.args.map((arg, index) => (
                <ValueField
                  key={arg.id}
                  spec={arg}
                  value={step.args[index] ?? ""}
                  disabled={disabled}
                  connected={connected}
                  onChange={(value) => setArg(index, value)}
                  onPick={onPick}
                />
              ))}
            </div>
          )}
          {advSpecs.length > 0 && (
            <>
              <div>
                <Button
                  variant="text"
                  size="sm"
                  label={t("zapscript.builder.options")}
                  icon={
                    optionsOpen ? (
                      <ChevronUpIcon size={20} />
                    ) : (
                      <ChevronDownIcon size={20} />
                    )
                  }
                  aria-expanded={optionsOpen}
                  aria-controls={`${id}-options`}
                  onClick={() => setOptionsOpen(!optionsOpen)}
                />
              </div>
              {optionsOpen && (
                <div id={`${id}-options`} className="zapscript-step-fields">
                  {advSpecs.map((adv) => (
                    <ValueField
                      key={adv.name}
                      spec={adv}
                      value={
                        step.advArgs.find(([name]) => name === adv.name)?.[1] ??
                        ""
                      }
                      disabled={disabled}
                      connected={connected}
                      onChange={(value) => setAdvArg(adv.name, value)}
                      onPick={onPick}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <TextInput
          className="font-mono"
          aria-label={t("zapscript.builder.textStepField", { position })}
          value={serializeZapStep(step)}
          disabled={disabled}
          setValue={(text) =>
            onChange({
              id: step.id,
              name: "",
              args: [text],
              advArgs: [],
              raw: true,
            })
          }
        />
      )}
    </li>
  );
}

/**
 * The step view of the ZapScript builder: one card per command, each with the
 * form for its arguments. The owner holds the steps and writes the text.
 */
export function ZapScriptSteps({
  steps,
  disabled,
  connected,
  onChange,
}: {
  steps: readonly ZapStep[];
  disabled: boolean;
  connected: boolean;
  onChange: (steps: ZapStep[]) => void;
}) {
  const { t } = useTranslation();
  const [commandsOpen, setCommandsOpen] = useState(false);
  // The target outlives the picker closing: pickers close as they report.
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pick = (target: PickerTarget) => {
    setPicker(target);
    setPickerOpen(true);
  };
  const replace = (index: number, step: ZapStep) =>
    onChange(steps.map((current, i) => (i === index ? step : current)));
  const move = (index: number, offset: -1 | 1) => {
    const next = [...steps];
    const [moved] = next.splice(index, 1);
    next.splice(index + offset, 0, moved!);
    onChange(next);
  };
  const addRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef(false);
  // Removing a card takes its focused button with it; land on Add step.
  useEffect(() => {
    if (!removedRef.current) return;
    removedRef.current = false;
    addRef.current?.focus();
  }, [steps.length]);
  const addStep = (
    <Button
      ref={addRef}
      label={t("zapscript.builder.addStep")}
      icon={<PlusIcon size={20} />}
      variant="outline"
      disabled={disabled}
      onClick={() => setCommandsOpen(true)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {steps.length === 0 ? (
        <EmptyState
          size="compact"
          title={t("zapscript.builder.empty")}
          description={t("zapscript.builder.emptyHint")}
          action={addStep}
        />
      ) : (
        <>
          <ol
            className="flex flex-col gap-2"
            aria-label={t("zapscript.builder.steps")}
          >
            {steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                position={index + 1}
                count={steps.length}
                disabled={disabled}
                connected={connected}
                onChange={(next) => replace(index, next)}
                onMove={(offset) => move(index, offset)}
                onRemove={() => {
                  removedRef.current = true;
                  onChange(steps.filter((_, i) => i !== index));
                }}
                onPick={pick}
              />
            ))}
          </ol>
          <div className="flex justify-center">{addStep}</div>
        </>
      )}

      <CommandsModal
        isOpen={commandsOpen}
        close={() => setCommandsOpen(false)}
        onSelect={(name) => onChange([...steps, createZapStep(name)])}
      />
      <MediaSearchModal
        isOpen={pickerOpen && picker?.kind === "media"}
        close={() => setPickerOpen(false)}
        onSelect={(path) => picker?.apply(path)}
      />
      <SystemSelector
        isOpen={pickerOpen && picker?.kind === "system"}
        onClose={() => setPickerOpen(false)}
        onSelect={(systems) => {
          if (systems[0]) picker?.apply(systems[0]);
        }}
        selectedSystems={[]}
        mode="insert"
        title={t("create.custom.selectSystem")}
        includeAllOption={false}
      />
      <LauncherSelector
        isOpen={pickerOpen && picker?.kind === "launcher"}
        onClose={() => setPickerOpen(false)}
        onSelect={(launcherId) => picker?.apply(launcherId)}
      />
    </div>
  );
}

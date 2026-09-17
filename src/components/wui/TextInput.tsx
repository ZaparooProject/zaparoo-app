/* eslint-disable react-hooks/refs -- False positive: linter incorrectly flags all props as refs when component has a ref prop */
import React, { KeyboardEventHandler, useEffect, useState, useId } from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { useHaptics } from "@/hooks/useHaptics";
import { SaveIcon, ClearIcon } from "@/lib/images";
import { Button } from "./Button";

export function TextInput(props: {
  label?: string;
  placeholder?: string;
  value: string | undefined;
  setValue?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  "aria-label"?: string;
  saveValue?: (value: string) => void;
  /** Disable just the save button (e.g., when value equals saved value) */
  saveDisabled?: boolean;
  clearable?: boolean;
  type?: string;
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search";
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  onKeyUp?: KeyboardEventHandler<HTMLInputElement>;
  ref?: React.RefObject<HTMLInputElement | null>;
  /** Error message to display below the input */
  error?: string;
  autoComplete?: string;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(props.value);
  const [modified, setModified] = useState(false);
  const { impact } = useHaptics();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the editable value synchronized with controlled prop updates.
    setValue(props.value);
  }, [props.value]);

  let type = props.type;
  if (!type) {
    type = "text";
  }

  const hasSaveAction = !!props.saveValue && !props.readOnly;

  return (
    <div className={props.className}>
      {props.label && (
        <label htmlFor={inputId} className="mb-2 block text-sm font-medium">
          {props.label}
        </label>
      )}
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            ref={props.ref}
            type={type}
            inputMode={props.inputMode}
            maxLength={props.maxLength}
            min={props.min}
            max={props.max}
            step={props.step}
            required={props.required}
            aria-invalid={!!props.error}
            aria-describedby={props.error ? errorId : undefined}
            className={classNames(
              "wui-input",
              "h-12",
              "w-full",
              "border",
              "border-solid",
              "p-2",
              "px-3",
              "disabled:border-foreground-disabled",
              "[&::-webkit-search-cancel-button]:appearance-none",
              {
                "border-bd-input": !props.disabled && !props.error,
                "border-error": props.error,
                "border-foreground-disabled": props.disabled,
                "text-foreground-disabled": props.disabled,
                "pr-10":
                  props.clearable &&
                  value &&
                  value.length > 0 &&
                  !props.disabled &&
                  !props.readOnly,
                "rounded-md": true,
              },
            )}
            style={{ backgroundColor: "var(--surface-inset)" }}
            disabled={props.disabled}
            readOnly={props.readOnly}
            aria-label={props["aria-label"]}
            placeholder={props.placeholder}
            value={value}
            autoComplete={props.autoComplete}
            onChange={(e) => {
              setValue(e.target.value);
              setModified(true);

              if (props.setValue) {
                props.setValue(e.target.value);
              }
            }}
            onKeyUp={props.onKeyUp}
          />
          {props.clearable &&
            value &&
            value.length > 0 &&
            !props.disabled &&
            !props.readOnly && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => {
                  if (props.readOnly) return;

                  impact("light");
                  setValue("");
                  setModified(true);
                  if (props.setValue) {
                    props.setValue("");
                  }
                }}
                aria-label={t("clearSearch")}
              >
                <ClearIcon size="16" />
              </button>
            )}
        </div>
        {hasSaveAction && (
          <Button
            disabled={!modified || props.disabled || props.saveDisabled}
            icon={<SaveIcon size="20" />}
            aria-label={t("save")}
            shape="square"
            className="size-12"
            onClick={() => {
              if (
                props.disabled ||
                props.readOnly ||
                props.saveDisabled ||
                value === undefined ||
                props.saveValue === undefined
              ) {
                return;
              }

              props.saveValue(value);
              setModified(false);
            }}
          />
        )}
      </div>
      {props.error && (
        <p id={errorId} className="text-error mt-1 text-sm" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

/* eslint-disable react-hooks/refs -- False positive: linter incorrectly flags all props as refs when component has a ref prop */
import React, { KeyboardEventHandler, useEffect, useState, useId } from "react";
import classNames from "classnames";
import { useHaptics } from "@/hooks/useHaptics";
import { SaveIcon, ClearIcon } from "../../lib/images";
import { Button } from "./Button";

export function TextInput(props: {
  label?: string;
  placeholder?: string;
  value: string | undefined;
  setValue?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  saveValue?: (value: string) => void;
  clearable?: boolean;
  type?: string;
  onKeyUp?: KeyboardEventHandler<HTMLInputElement>;
  ref?: React.RefObject<HTMLInputElement | null>;
  /** Error message to display below the input */
  error?: string;
}) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(props.value);
  const [modified, setModified] = useState(false);
  const { impact } = useHaptics();

  useEffect(() => {
    setValue(props.value);
  }, [props.value]);

  let type = props.type;
  if (!type) {
    type = "text";
  }

  return (
    <div className={props.className}>
      {props.label && (
        <label htmlFor={inputId} className="mb-1 block">
          {props.label}
        </label>
      )}
      <div className="flex flex-row">
        <div className="relative flex-grow">
          <input
            id={inputId}
            ref={props.ref}
            type={type}
            aria-invalid={!!props.error}
            aria-describedby={props.error ? errorId : undefined}
            className={classNames(
              "bg-background",
              "h-12",
              "w-full",
              "border",
              "border-solid",
              "p-2",
              "px-3",
              "disabled:border-foreground-disabled",
              {
                "border-bd-input": !props.disabled && !props.error,
                "border-red-500": props.error,
                "border-foreground-disabled": props.disabled,
                "text-foreground-disabled": props.disabled,
                "pr-10":
                  props.clearable &&
                  value &&
                  value.length > 0 &&
                  !props.disabled,
                "rounded-md": !props.saveValue,
                "rounded-s-md": props.saveValue,
              },
            )}
            style={{ backgroundColor: "var(--color-background)" }}
            disabled={props.disabled}
            placeholder={props.placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setModified(true);

              if (props.setValue) {
                props.setValue(e.target.value);
              }
            }}
            onKeyUp={props.onKeyUp}
          />
          {props.clearable && value && value.length > 0 && !props.disabled && (
            <button
              type="button"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:text-white"
              onClick={() => {
                impact("light");
                setValue("");
                setModified(true);
                if (props.setValue) {
                  props.setValue("");
                }
              }}
              aria-label="Clear search"
            >
              <ClearIcon size="16" />
            </button>
          )}
        </div>
        {props.saveValue && (
          <Button
            disabled={!modified || props.disabled}
            icon={<SaveIcon size="20" />}
            aria-label="Save"
            className="h-12 w-12 rounded-s-lg pr-3"
            onClick={() => {
              if (
                props.disabled ||
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
        <p id={errorId} className="mt-1 text-sm text-red-500" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

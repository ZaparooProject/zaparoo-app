import React, { KeyboardEventHandler, useEffect, useState } from "react";
import classNames from "classnames";
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
}) {
  const [value, setValue] = useState(props.value);
  const [modified, setModified] = useState(false);

  useEffect(() => {
    setValue(props.value);
  }, [props.value]);

  let type = props.type;
  if (!type) {
    type = "text";
  }

  return (
    <div className={props.className}>
      {props.label && <span className="mb-1 block">{props.label}</span>}
      <div className="flex flex-row">
        <div className="relative flex-grow">
          <input
            ref={props.ref}
            type={type}
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
                "border-bd-input": !props.disabled,
                "border-foreground-disabled": props.disabled,
                "text-foreground-disabled": props.disabled,
                "pr-10": props.clearable && value && value.length > 0 && !props.disabled,
                "rounded-md": !props.saveValue,
                "rounded-s-md": props.saveValue
              }
            )}
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors rounded"
              onClick={() => {
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
    </div>
  );
}

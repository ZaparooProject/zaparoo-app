import { KeyboardEventHandler, useEffect, useState } from "react";
import { SaveIcon } from "../../lib/images";
import { Button } from "./Button";
import classNames from "classnames";

export function TextInput(props: {
  label?: string;
  placeholder?: string;
  value: string | undefined;
  setValue?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  saveValue?: (value: string) => void;
  autoFocus?: boolean;
  type?: string;
  onKeyUp?: KeyboardEventHandler<HTMLInputElement>;
  ref?: React.RefObject<HTMLInputElement>;
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
      {props.label && <span>{props.label}</span>}
      <div className="flex flex-row">
        <input
          ref={props.ref}
          type={type}
          className={classNames(
            "bg-background",
            "h-12",
            "flex-grow",
            "border",
            "border-solid",
            "p-2",
            "px-3",
            "rounded-none",
            "disabled:border-foreground-disabled",
            {
              "border-bd-input": !props.disabled,
              "border-foreground-disabled": props.disabled,
              "text-foreground-disabled": props.disabled
            }
          )}
          disabled={props.disabled}
          placeholder={props.placeholder}
          value={value}
          autoFocus={props.autoFocus}
          onChange={(e) => {
            setValue(e.target.value);
            setModified(true);

            if (props.setValue) {
              props.setValue(e.target.value);
            }
          }}
          onKeyUp={props.onKeyUp}
        />
        {props.saveValue && (
          <Button
            disabled={!modified || props.disabled}
            icon={<SaveIcon size="20" />}
            className="h-12 w-12 rounded-s-lg pr-3"
            onClick={() => {
              if (!props.saveValue || !value || props.disabled) {
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

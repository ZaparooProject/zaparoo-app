import classNames from "classnames";

export function ToggleSwitch(props: {
  label: string;
  value: boolean | undefined;
  setValue: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-foreground flex cursor-pointer select-none items-center justify-between">
      <span>{props.label}</span>
      <div className="relative">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={props.value}
          disabled={props.disabled}
          onChange={(e) => {
            if (props.disabled) {
              return;
            }

            props.setValue(e.target.checked);
          }}
        />
        <div
          className={classNames(
            "block",
            "h-8",
            "w-[51px]",
            "rounded-full",
            "border",
            "border-solid",
            {
              "bg-button-pattern": props.value && !props.disabled,
              "bg-background": !props.value && !props.disabled,
              "border-bd-outline": !props.disabled,
              "border-foreground-disabled": props.disabled
            }
          )}
        ></div>
        <div
          className={classNames(
            "dot",
            "bg-bd-outline",
            "peer-checked:bg-foreground",
            "absolute",
            "left-1.5",
            "top-2",
            "h-4",
            "w-4",
            "rounded-full",
            "transition",
            "peer-checked:left-0",
            "peer-checked:top-1",
            "peer-checked:h-6",
            "peer-checked:w-6",
            "peer-checked:translate-x-full",
            {
              "peer-checked:bg-foreground-disabled": props.disabled,
              "pointer-events-none": props.disabled,
              "bg-white": !props.disabled,
              "bg-foreground-disabled": props.disabled
            }
          )}
        ></div>
      </div>
    </label>
  );
}

import { forwardRef, memo, useId } from "react";
import classNames from "classnames";
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";

interface PinInputProps {
  label?: string;
  value: string;
  setValue: (value: string) => void;
  length?: number;
  disabled?: boolean;
  onComplete?: (value: string) => void;
  /** Aria-label override when no visible label is set. */
  ariaLabel?: string;
}

export const PinInput = memo(
  forwardRef<HTMLDivElement, PinInputProps>(function PinInput(
    { label, value, setValue, length = 6, disabled, onComplete, ariaLabel },
    ref,
  ) {
    const inputId = useId();

    return (
      <div ref={ref}>
        {label && (
          <label htmlFor={inputId} className="mb-2 block text-sm font-medium">
            {label}
          </label>
        )}
        {/* Badge-pushing would expand the invisible input beyond sheet scroll bounds. */}
        <OTPInput
          id={inputId}
          value={value}
          onChange={setValue}
          onComplete={onComplete}
          maxLength={length}
          disabled={disabled}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          pushPasswordManagerStrategy="none"
          aria-label={!label ? ariaLabel : undefined}
          containerClassName={classNames(
            "flex w-fit max-w-full items-center gap-2",
            "has-[:disabled]:opacity-50",
          )}
          render={({ slots }) => (
            <>
              {slots.map((slot, idx) => (
                <Slot key={idx} {...slot} disabled={disabled} />
              ))}
            </>
          )}
        />
      </div>
    );
  }),
);

function Slot({
  char,
  isActive,
  disabled,
}: SlotProps & { disabled?: boolean }) {
  return (
    <div
      data-active={isActive ? "true" : undefined}
      style={{ backgroundColor: "var(--surface-inset)" }}
      className={classNames(
        "wui-input relative flex h-12 w-12 min-w-0 items-center justify-center",
        "border border-solid",
        "rounded-md text-2xl font-semibold",
        "transition-[border-color,box-shadow] duration-150",
        {
          "border-foreground-disabled text-foreground-disabled": disabled,
          "border-bd-input": !disabled && !isActive,
          "border-primary ring-primary/30 ring-2": !disabled && isActive,
          "text-foreground": !disabled,
        },
      )}
    >
      {char}
    </div>
  );
}

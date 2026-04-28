import { useId } from "react";
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

export function PinInput({
  label,
  value,
  setValue,
  length = 6,
  disabled,
  onComplete,
  ariaLabel,
}: PinInputProps) {
  const inputId = useId();

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="mb-1 block">
          {label}
        </label>
      )}
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
        aria-label={!label ? ariaLabel : undefined}
        containerClassName={classNames(
          "flex items-center gap-2",
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
}

function Slot({
  char,
  isActive,
  disabled,
}: SlotProps & { disabled?: boolean }) {
  return (
    <div
      data-active={isActive ? "true" : undefined}
      style={{ backgroundColor: "var(--color-background)" }}
      className={classNames(
        "relative flex h-12 w-10 items-center justify-center",
        "border border-solid",
        "rounded-md text-2xl font-medium",
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

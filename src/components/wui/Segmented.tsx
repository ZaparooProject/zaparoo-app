import classNames from "classnames";
import { TabBar } from "@/components/wui/TabBar";

interface SegmentedProps<T extends string> {
  label: string;
  labelHidden?: boolean;
  help?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  label,
  labelHidden = false,
  help,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedProps<T>) {
  return (
    <div className="flex flex-col">
      <span className={classNames("mb-1 block", { "sr-only": labelHidden })}>
        {label}
      </span>
      <TabBar
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {help && (
        <span className="text-muted-foreground mt-1 text-sm">{help}</span>
      )}
    </div>
  );
}

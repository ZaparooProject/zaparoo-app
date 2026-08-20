import type { ReactNode } from "react";

interface ModalActionBarProps {
  secondaryAction?: ReactNode;
  primaryAction: ReactNode;
}

export function ModalActionBar({
  secondaryAction,
  primaryAction,
}: ModalActionBarProps) {
  if (
    secondaryAction === null ||
    secondaryAction === undefined ||
    secondaryAction === false
  ) {
    return <div className="[&>*]:min-h-12 [&>*]:w-full">{primaryAction}</div>;
  }

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1 [&>*]:min-h-12 [&>*]:w-full">
        {secondaryAction}
      </div>
      <div className="min-w-0 flex-1 [&>*]:min-h-12 [&>*]:w-full">
        {primaryAction}
      </div>
    </div>
  );
}

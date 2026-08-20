import type { ReactNode } from "react";

interface ModalActionRailProps {
  actions: ReactNode;
  primaryAction: ReactNode;
  "aria-label": string;
}

export function ModalActionRail({
  actions,
  primaryAction,
  "aria-label": ariaLabel,
}: ModalActionRailProps) {
  return (
    <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,auto)_minmax(12rem,1fr)]">
      <div className="min-w-0 overflow-hidden">
        <div
          role="group"
          aria-label={ariaLabel}
          className="overflow-x-auto overscroll-x-contain pb-1 sm:pb-0"
        >
          <div className="grid min-w-full auto-cols-[minmax(5.5rem,1fr)] grid-flow-col gap-1 sm:min-w-0 [&>*]:min-h-14 [&>*]:w-full [&>*]:min-w-0 sm:[&>*]:min-h-12">
            {actions}
          </div>
        </div>
      </div>
      <div className="min-w-0 [&>*]:min-h-12 [&>*]:w-full">{primaryAction}</div>
    </div>
  );
}

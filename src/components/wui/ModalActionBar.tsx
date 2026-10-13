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
    // A lone action matches a standalone full-width button: capped and
    // centered from the md breakpoint rather than spanning the dialog.
    return (
      <div className="[&>*]:min-h-12 [&>*]:w-full md:[&>*]:mx-auto md:[&>*]:max-w-[20rem]">
        {primaryAction}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1 [&>*]:min-h-12 [&>*]:w-full [&>*]:max-w-none">
        {secondaryAction}
      </div>
      <div className="min-w-0 flex-1 [&>*]:min-h-12 [&>*]:w-full [&>*]:max-w-none">
        {primaryAction}
      </div>
    </div>
  );
}

import { ReactElement, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";

export interface HeaderOverflowAction {
  id: string;
  label: string;
  icon: ReactElement;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

export function HeaderOverflowMenu(props: { actions: HeaderOverflowAction[] }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (props.actions.length === 0) return null;

  return (
    <>
      <HeaderButton
        icon={<Ellipsis size={22} />}
        active={isOpen}
        onClick={() => setIsOpen(true)}
        title={t("nav.moreActions")}
        aria-label={t("nav.moreActions")}
        aria-expanded={isOpen}
      />
      {typeof document !== "undefined" &&
        createPortal(
          <SlideModal
            isOpen={isOpen}
            close={() => setIsOpen(false)}
            title={t("nav.moreActions")}
          >
            <div className="flex flex-col gap-2 pb-1">
              {props.actions.map((action) => (
                <Button
                  key={action.id}
                  variant="secondary"
                  className="w-full"
                  icon={action.icon}
                  label={action.label}
                  disabled={action.disabled}
                  onClick={() => {
                    setIsOpen(false);
                    void action.onClick();
                  }}
                />
              ))}
            </div>
          </SlideModal>,
          document.body,
        )}
    </>
  );
}

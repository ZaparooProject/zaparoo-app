import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { useAppBadge } from "@/hooks/useAppBadge";

export function AppBadgeManager() {
  const { t } = useTranslation();
  const {
    showPermissionRationale,
    showPermissionDeniedHelp,
    isRequestingPermission,
    dismissPermissionRationale,
    declinePermissionRationale,
    dismissPermissionDeniedHelp,
    requestPermission,
  } = useAppBadge();

  return (
    <>
      <SlideModal
        isOpen={showPermissionRationale}
        close={dismissPermissionRationale}
        title={t("appBadge.title")}
        footer={
          <ModalActionBar
            secondaryAction={
              <Button
                label={t("appBadge.noThanks")}
                variant="secondary"
                onClick={declinePermissionRationale}
                disabled={isRequestingPermission}
                disabledAppearance="busy"
              />
            }
            primaryAction={
              <Button
                label={
                  isRequestingPermission
                    ? t("appBadge.requesting")
                    : t("appBadge.continue")
                }
                intent="primary"
                onClick={() => void requestPermission()}
                disabled={isRequestingPermission}
                disabledAppearance="busy"
              />
            }
          />
        }
      >
        <div className="py-4">
          <p className="text-center">{t("appBadge.description")}</p>
        </div>
      </SlideModal>

      <SlideModal
        isOpen={showPermissionDeniedHelp}
        close={dismissPermissionDeniedHelp}
        title={t("appBadge.title")}
        footer={
          <Button
            label={t("nav.close")}
            className="w-full"
            onClick={dismissPermissionDeniedHelp}
          />
        }
      >
        <div className="py-4">
          <p className="text-center">{t("appBadge.deniedDescription")}</p>
        </div>
      </SlideModal>
    </>
  );
}

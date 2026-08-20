import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
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
          <div className="flex flex-row gap-2">
            <Button
              label={t("appBadge.noThanks")}
              variant="outline"
              className="flex-1"
              onClick={declinePermissionRationale}
              disabled={isRequestingPermission}
            />
            <Button
              label={
                isRequestingPermission
                  ? t("appBadge.requesting")
                  : t("appBadge.continue")
              }
              intent="primary"
              className="flex-1"
              onClick={() => void requestPermission()}
              disabled={isRequestingPermission}
            />
          </div>
        }
      >
        <div className="p-4">
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
            className="mx-auto w-fit"
            onClick={dismissPermissionDeniedHelp}
          />
        }
      >
        <div className="p-4">
          <p className="text-center">{t("appBadge.deniedDescription")}</p>
        </div>
      </SlideModal>
    </>
  );
}

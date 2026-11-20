import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { SlideModal } from "@/components/SlideModal";
import { ProGuideAntennaStep } from "@/components/ProGuideAntennaStep";
import { Button } from "@/components/wui/Button";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { useAppUi } from "@/hooks/useAppUi";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useProGuideStore } from "@/lib/proGuideStore";
import type { AntennaSpot } from "@/lib/nfcAntenna";

type StepId = "unlock" | "launch" | "antenna" | "shake";

const stepTitleKey: Record<StepId, string> = {
  unlock: "proGuide.unlockTitle",
  launch: "proGuide.launchTitle",
  antenna: "proGuide.antennaTitle",
  shake: "proGuide.shakeTitle",
};

const noSubscription = () => () => {};

export function ProGuideDialog({
  isOpen,
  onFinish,
  previewAntenna,
}: {
  isOpen: boolean;
  onFinish: () => void;
  previewAntenna: AntennaSpot | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appUi = useAppUi();
  const [stepIndex, setStepIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shownStep = useRef(0);

  // Every showing starts from the first step.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setStepIndex(0);
  }

  const steps = useMemo(() => {
    const list: StepId[] = ["unlock"];
    if (appUi.nfc || appUi.camera) list.push("launch");
    if (appUi.nfc) list.push("antenna");
    if (appUi.accelerometer) list.push("shake");
    return list;
  }, [appUi.nfc, appUi.camera, appUi.accelerometer]);

  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index] ?? "unlock";
  const isLast = index === steps.length - 1;

  // The dialog heading only takes focus when the dialog opens, so move it
  // there again on each step for screen readers and keyboard users.
  useEffect(() => {
    if (shownStep.current === index) return;
    shownStep.current = index;
    const dialog = bodyRef.current?.closest("[aria-labelledby]");
    const titleId = dialog?.getAttribute("aria-labelledby");
    if (titleId) document.getElementById(titleId)?.focus();
  }, [index]);

  const goBack = () => {
    if (index === 0) onFinish();
    else setStepIndex(index - 1);
  };
  const goNext = () => {
    if (isLast) onFinish();
    else setStepIndex(index + 1);
  };

  // Above SlideModal's own Back handling, which would close the guide.
  useBackButtonHandler(
    "pro-guide",
    () => {
      goBack();
      return true;
    },
    110,
    isOpen,
  );

  const openShakeSettings = () => {
    onFinish();
    void navigate({ to: "/settings/readers" });
  };

  return (
    <SlideModal
      isOpen={isOpen}
      close={onFinish}
      title={t(stepTitleKey[step])}
      footer={
        <ModalActionBar
          secondaryAction={
            index === 0 ? (
              <Button
                label={t("proGuide.skip")}
                variant="secondary"
                onClick={onFinish}
              />
            ) : (
              <Button
                label={t("nav.back")}
                variant="secondary"
                onClick={goBack}
              />
            )
          }
          primaryAction={
            <Button
              label={isLast ? t("proGuide.done") : t("proGuide.next")}
              intent="primary"
              onClick={goNext}
            />
          }
        />
      }
    >
      <div ref={bodyRef} className="flex flex-col gap-3 py-2">
        {steps.length > 1 && (
          <p className="text-muted-foreground text-sm">
            {t("proGuide.stepCount", {
              current: index + 1,
              total: steps.length,
            })}
          </p>
        )}

        {step === "unlock" && (
          <>
            <p className="text-muted-foreground">{t("proGuide.unlockIntro")}</p>
            <ul className="text-muted-foreground list-disc space-y-2 pl-5">
              {(appUi.nfc || !appUi.enabled) && (
                <li>{t("proGuide.unlockNfc")}</li>
              )}
              {(appUi.camera || !appUi.enabled) && (
                <li>{t("proGuide.unlockCamera")}</li>
              )}
              {(appUi.accelerometer || !appUi.enabled) && (
                <li>{t("proGuide.unlockShake")}</li>
              )}
            </ul>
          </>
        )}

        {step === "launch" && (
          <>
            {appUi.nfc && (
              <p className="text-muted-foreground">{t("proGuide.launchNfc")}</p>
            )}
            {appUi.camera && (
              <p className="text-muted-foreground">
                {t("proGuide.launchCamera")}
              </p>
            )}
          </>
        )}

        {step === "antenna" && (
          <ProGuideAntennaStep
            active={isOpen}
            previewAntenna={previewAntenna}
          />
        )}

        {step === "shake" && (
          <>
            <p className="text-muted-foreground">{t("proGuide.shakeBody")}</p>
            <Button
              label={t("proGuide.shakeSettings")}
              variant="outline"
              onClick={openShakeSettings}
              className="w-full"
            />
          </>
        )}
      </div>
    </SlideModal>
  );
}

/**
 * One-time guide shown when Pro first becomes active, by trial or purchase.
 * Waits for saved preferences, for the first-run tour to finish and for any
 * other dialog to close, so it never stacks on the tour or a checkout sheet.
 */
export function ProGuide() {
  const preferencesReady = usePreferencesStore(
    (state) => state._hasHydrated && state._preferencesHydrationSucceeded,
  );
  const completed = usePreferencesStore((state) => state.proGuideCompleted);
  const tourCompleted = usePreferencesStore((state) => state.tourCompleted);
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);
  const trialActive = usePreferencesStore(
    (state) => state.onlineTrialExpiresAt !== null,
  );
  const setCompleted = usePreferencesStore(
    (state) => state.setProGuideCompleted,
  );
  const pending = useProGuideStore((state) => state.pending);
  const open = useProGuideStore((state) => state.open);
  const previewAntenna = useProGuideStore((state) => state.previewAntenna);
  const request = useProGuideStore((state) => state.request);
  const show = useProGuideStore((state) => state.show);
  const close = useProGuideStore((state) => state.close);
  const appUi = useAppUi();
  const modalManager = useSlideModalManager();
  const otherDialogOpen = useSyncExternalStore(
    modalManager.subscribe ?? noSubscription,
    () => modalManager.hasOpenModalExcept?.("") ?? false,
    () => false,
  );

  // A trial is session-bound, so it is noticed when access is confirmed.
  useEffect(() => {
    if (preferencesReady && trialActive && !completed) request();
  }, [preferencesReady, trialActive, completed, request]);

  useEffect(() => {
    if (
      open ||
      !pending ||
      !preferencesReady ||
      completed ||
      !tourCompleted ||
      !launcherAccess ||
      !appUi.enabled ||
      otherDialogOpen
    ) {
      return;
    }
    show();
  }, [
    open,
    pending,
    preferencesReady,
    completed,
    tourCompleted,
    launcherAccess,
    appUi.enabled,
    otherDialogOpen,
    show,
  ]);

  const finish = useCallback(() => {
    close();
    // Another dialog opening closes this one through the modal manager. That
    // dialog has registered by the next task, so the guide waits for it to
    // close instead of counting as seen.
    setTimeout(() => {
      if (modalManager.hasOpenModalExcept?.("")) {
        request();
      } else {
        setCompleted(true);
      }
    }, 0);
  }, [close, modalManager, request, setCompleted]);

  return (
    <ProGuideDialog
      isOpen={open}
      onFinish={finish}
      previewAntenna={previewAntenna}
    />
  );
}

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";
import { BackIcon, CreateIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { PageFrame } from "@/components/PageFrame";
import { usePreferencesStore, selectCustomText } from "@/lib/preferencesStore";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

export const Route = createFileRoute("/create/custom")({
  component: CustomText,
});

export function CustomText() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("create.custom.title"),
  );
  const { customText, setCustomText } = usePreferencesStore(
    useShallow(selectCustomText),
  );
  const writeActivity = useContextualNfcWrite("create-custom", true);

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/create"));

  return (
    <>
      <PageFrame
        headerMode="content-wide"
        layout="workspace"
        breadcrumbs={[{ to: "/create", label: t("create.title") }]}
        onSwipeBack={goBack}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("create.custom.title")}
          </h1>
        }
      >
        <div className="custom-zapscript-page flex flex-col gap-4">
          <ZapScriptInput
            split
            value={customText}
            setValue={setCustomText}
            rows={5}
            // The tag gets the text captured at press time, so it cannot
            // change underneath a pending write or its retry.
            disabled={writeActivity.active}
          />

          <ReaderActivityControl
            state={writeActivity.state}
            idleLabel={t("create.custom.write")}
            activeLabel={writeActivity.activeLabel}
            errorMessage={writeActivity.errorMessage}
            icon={<CreateIcon size="20" />}
            className="w-full"
            buttonClassName="w-full"
            onStart={() => void writeActivity.start(customText)}
            onCancel={writeActivity.onCancel}
            onRetry={writeActivity.onRetry}
            disabled={customText === "" || writeActivity.externalWriteActive}
          />
        </div>
      </PageFrame>
    </>
  );
}

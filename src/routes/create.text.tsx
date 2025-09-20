import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";
import { CreateIcon } from "../lib/images";
import { Button } from "../components/wui/Button";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { WriteModal } from "../components/WriteModal";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";

interface LoaderData {
  customText: string;
}

export const Route = createFileRoute("/create/text")({
  loader: async (): Promise<LoaderData> => {
    const customTextPreference = await Preferences.get({ key: "customText" });

    return {
      customText: customTextPreference.value || ""
    };
  },
  // Disable caching to ensure fresh preference is always read
  staleTime: 0,
  gcTime: 0,
  component: CustomText
});

function CustomText() {
  const loaderData = Route.useLoaderData();
  const [customText, setCustomText] = useState(loaderData.customText);
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = async () => {
    setWriteOpen(false);
    await nfcWriter.end();
  };
  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
    }
  }, [nfcWriter]);

  useEffect(() => {
    const savePreference = async () => {
      await Preferences.set({ key: "customText", value: customText });
    };
    savePreference();
  }, [customText]);

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/create" }),
    preventScrollOnSwipe: false
  });

  return (
    <>
      <div {...swipeHandlers} className="h-full w-full overflow-y-auto">
        <PageFrame
          title={t("create.custom.title")}
          back={() => navigate({ to: "/create" })}
        >
          <div className="flex flex-col gap-3">
            <ZapScriptInput
              value={customText}
              setValue={setCustomText}
              showPalette
              rows={5}
            />

            <Button
              icon={<CreateIcon size="20" />}
              label={t("create.custom.write")}
              disabled={customText === ""}
              onClick={() => {
                if (customText !== "") {
                  nfcWriter.write(WriteAction.Write, customText);
                  setWriteOpen(true);
                }
              }}
            />
          </div>
        </PageFrame>
      </div>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}

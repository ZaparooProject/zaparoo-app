import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownIcon, CameraIcon, NfcIcon, SaveIcon } from "lucide-react";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";
import { ClearIcon } from "@/lib/images.tsx";
import { CoreAPI } from "@/lib/coreApi.ts";
import { useStatusStore } from "@/lib/store.ts";
import { MappingResponse } from "@/lib/models.ts";
import { Button } from "../components/wui/Button";
import { PageFrame } from "../components/PageFrame";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { WriteModal } from "../components/WriteModal";
import { useSmartSwipe } from "../hooks/useSmartSwipe";

export const Route = createFileRoute("/create/mappings")({
  component: Mappings
});

const mappingExists = (mappings: MappingResponse[] | undefined, id: string) => {
  if (mappings === undefined) {
    return null;
  }

  for (const mapping of mappings) {
    if (mapping.type == "uid" && mapping.pattern === id) {
      return {
        id: mapping.id,
        script: mapping.override
      };
    }
  }
  return null;
};

function Mappings() {
  const connected = useStatusStore((state) => state.connected);
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const [tokenId, setTokenId] = useState<string>("");
  const [script, setScript] = useState<string>("");
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = () => router.history.back();

  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false
  });

  const mappings = useQuery({
    queryKey: ["mappings"],
    queryFn: () => CoreAPI.mappings()
  });

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);

      if (nfcWriter.result?.info.tag?.uid) {
        const uid = nfcWriter.result.info.tag.uid;
        setTokenId(uid);
        const existing = mappingExists(mappings.data?.mappings, uid);
        if (existing !== null) {
          setScript(existing.script);
        } else {
          setScript("");
        }
      }
    }
  }, [nfcWriter.result, nfcWriter, mappings.data]);

  const closeWriteModal = async () => {
    setWriteOpen(false);
    await nfcWriter.end();
  };

  const saveMapping = () => {
    console.log(mappings.data?.mappings);
    const existing = mappingExists(mappings.data?.mappings, tokenId);
    if (existing !== null) {
      CoreAPI.updateMapping({
        id: parseInt(existing.id, 10),
        label: "",
        enabled: true,
        type: "uid",
        match: "exact",
        pattern: tokenId,
        override: script
      }).then(() => {
        toast.success(t("create.mappings.savedSuccess"));
        setTokenId("");
        setScript("");
      });
    } else {
      CoreAPI.newMapping({
        label: "",
        enabled: true,
        type: "uid",
        match: "exact",
        pattern: tokenId,
        override: script
      }).then(() => {
        toast.success(t("create.mappings.savedSuccess"));
        setTokenId("");
        setScript("");
      });
    }
  };

  if (mappings.isLoading || mappings.isError) {
    return <></>;
  }

  return (
    <>
      <PageFrame
        {...swipeHandlers}
        title={t("create.mappings.title")}
        back={goBack}
      >
          <div className="flex flex-col gap-3">
            <div>
              <TextInput
                value={tokenId}
                setValue={(v) => setTokenId(v)}
                label={t("create.mappings.tokenId")}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                className="w-full"
                icon={<NfcIcon size={20} />}
                onClick={() => {
                  nfcWriter.write(WriteAction.Read);
                  setWriteOpen(true);
                }}
                label={t("scan.nfcMode")}
              />
              <Button
                className="w-full"
                icon={<CameraIcon size={20} />}
                onClick={() => {
                  BarcodeScanner.scan().then((res) => {
                    if (res.barcodes.length < 1) {
                      return;
                    }
                    const barcode = res.barcodes[0];
                    setTokenId(barcode.rawValue);
                    const existing = mappingExists(
                      mappings.data?.mappings,
                      barcode.rawValue
                    );
                    if (existing !== null) {
                      setScript(existing.script);
                    } else {
                      setScript("");
                    }
                  });
                }}
                label={t("scan.cameraMode")}
              />
            </div>

            <div className="flex flex-row items-center justify-center">
              <ArrowDownIcon size={50} />
            </div>

            <ZapScriptInput
              value={script}
              setValue={setScript}
              showPalette
              rows={4}
            />

            <Button
              icon={<SaveIcon size={20} />}
              label={t("create.mappings.saveMapping")}
              disabled={!tokenId || !script || !connected}
              onClick={() => {
                if (tokenId && script && connected) {
                  saveMapping();
                  mappings.refetch();
                }
              }}
            />

            <Button
              variant="text"
              icon={<ClearIcon size="20" />}
              label={t("create.mappings.clearMapping")}
              disabled={
                !mappingExists(mappings.data?.mappings, tokenId) ||
                !connected ||
                !tokenId
              }
              onClick={() => {
                const existing = mappingExists(
                  mappings.data?.mappings,
                  tokenId
                );
                if (existing && connected && tokenId) {
                  CoreAPI.deleteMapping({ id: parseInt(existing.id, 10) }).then(
                    () => {
                      setTokenId("");
                      setScript("");
                      mappings.refetch();
                    }
                  );
                }
              }}
            />
          </div>
        </PageFrame>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}

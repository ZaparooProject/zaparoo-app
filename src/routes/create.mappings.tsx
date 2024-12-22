import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSwipeable } from "react-swipeable";
// import { useStatusStore } from "../lib/store";
import { WriteModal } from "../components/WriteModal";
import { useEffect, useState } from "react";
import { useNfcWriter } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/wui/Button";
import { CoreAPI } from "../lib/coreApi.ts";

export const Route = createFileRoute("/create/mappings")({
  component: Mappings
});

function Mappings() {
  // const connected = useStatusStore((state) => state.connected);
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = () => {
    setWriteOpen(false);
    nfcWriter.end();
  };

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
      nfcWriter.end();
    }
  }, [nfcWriter]);

  const mappings = useQuery({
    queryKey: ["mappings"],
    queryFn: () => CoreAPI.mappings()
  });

  const navigate = useNavigate();
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate({ to: "/create" })
  });

  return (
    <>
      <div {...swipeHandlers}>
        <PageFrame
          title={t("create.mappings.title")}
          back={() => navigate({ to: "/create" })}
        >
          <Button label={t("create.mappings.add")} />
          {mappings.isLoading && <div>Loading...</div>}
          {mappings.isError && <div>Error loading mappings</div>}
          {mappings.isSuccess && (
            <div className="flex flex-col gap-3">
              {mappings.data?.mappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className="border border-solid border-bd-input p-3"
                >
                  <div className="flex flex-col items-center gap-3">
                    <span>{mapping.id}</span>
                    <span>{mapping.added}</span>
                    <span className="font-semibold">{mapping.label}</span>
                    <span>{mapping.enabled}</span>
                    <span>{mapping.type}</span>
                    <span>{mapping.match}</span>
                    <span>{mapping.pattern}</span>
                    <span>{mapping.override}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageFrame>
      </div>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}

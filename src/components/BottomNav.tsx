import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ClearIcon, CreateIcon, ScanIcon, SettingsIcon } from "../lib/images";
import { useStatusStore } from "../lib/store.ts";
import { cancelCamera } from "../routes";

function Button(props: { text: string; icon: JSX.Element; path: string }) {
  return (
    <div className="inline-flex flex-col items-center justify-center">
      <Link
        to={props.path}
        style={{
          transition: "color 0.3s, filter 0.3s"
        }}
        className="text-bd-outline [&.active]:text-primary"
      >
        <div>
          <div className="flex justify-center drop-shadow">{props.icon}</div>
          <div className="text-center leading-4 drop-shadow">{props.text}</div>
        </div>
      </Link>
    </div>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const cameraOpen = useStatusStore((state) => state.cameraOpen);
  const setCameraOpen = useStatusStore((state) => state.setCameraOpen);

  return (
    <div
      className="border-t border-t-[#ffffff21] bg-[#111928bf] px-9 pb-1 backdrop-blur"
      style={{
        height: "calc(80px + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingRight: "calc(2.25rem + env(safe-area-inset-right))",
        paddingLeft: "calc(2.25rem + env(safe-area-inset-left))"
      }}
    >
      {cameraOpen ? (
        <div className="mx-auto grid h-full max-w-lg grid-cols-1">
          <div className="inline-flex flex-col items-center justify-center">
            <div
              className="text-bd-outline [&.active]:text-primary"
              onClick={() => cancelCamera(() => setCameraOpen(false))}
            >
              <div className="flex justify-center drop-shadow">
                <ClearIcon size="24" />
              </div>
              <div className="text-center leading-4 drop-shadow">
                {t("nav.cancel")}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto grid h-full max-w-lg grid-cols-3">
          <Button
            text={t("nav.index")}
            icon={<ScanIcon size="24" />}
            path="/"
          />
          <Button
            text={t("nav.create")}
            icon={<CreateIcon size="24" />}
            path="/create"
          />
          <Button
            text={t("nav.settings")}
            icon={<SettingsIcon size="24" />}
            path="/settings"
          />
        </div>
      )}
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { NfcIcon, SettingsIcon, SquarePenIcon } from "lucide-react";
import classNames from "classnames";

function Button(props: {
  text: string;
  icon: JSX.Element;
  path: string;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        "inline-flex flex-col items-center justify-center",
        props.className
      )}
    >
      <Link
        to={props.path}
        style={{
          transition: "color 0.3s, filter 0.3s"
        }}
        className="text-bd-outline [&.active]:text-[#3faeec]"
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
      <div className="mx-auto grid h-full max-w-lg grid-cols-3 gap-4">
        <Button text={t("nav.index")} icon={<NfcIcon size="24" />} path="/" />
        {/* <Button text={t("nav.run")} icon={<PlayIcon size="24" />} path="/run" /> */}
        <Button
          text={t("nav.create")}
          icon={<SquarePenIcon size="24" />}
          path="/create"
        />
        <Button
          text={t("nav.settings")}
          icon={<SettingsIcon size="24" />}
          path="/settings"
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";

const writeToClipboard = async (s: string) => {
  await Clipboard.write({
    string: s
  });
};

export const CopyButton = (props: { text: string }) => {
  const { t } = useTranslation();

  const [display, setDisplay] = useState(t("copy"));

  if (!Capacitor.isNativePlatform()) {
    return <></>;
  }

  return (
    <span
      className="ml-1 cursor-pointer px-1 text-xs font-semibold text-white underline"
      onClick={(e) => {
        e.stopPropagation();
        writeToClipboard(props.text).then(() => {
          setDisplay(t("copied"));
          setTimeout(() => {
            setDisplay(t("copy"));
          }, 2000);
        });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          writeToClipboard(props.text).then(() => {
            setDisplay(t("copied"));
            setTimeout(() => {
              setDisplay(t("copy"));
            }, 2000);
          });
        }
      }}
      role="button"
      tabIndex={0}
      style={{ whiteSpace: "nowrap" }}
    >
      {display}
    </span>
  );
};

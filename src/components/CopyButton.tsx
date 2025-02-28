import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clipboard } from "@capacitor/clipboard";

const writeToClipboard = async (s: string) => {
  await Clipboard.write({
    string: s
  });
};

export const CopyButton = (props: { text: string }) => {
  const { t } = useTranslation();

  const [display, setDisplay] = useState(t("copy"));

  if (location.protocol !== "https:") {
    return <></>;
  }

  return (
    <span
      className="ml-1 cursor-pointer rounded-full border px-1"
      onClick={() => {
        writeToClipboard(props.text).then(() => {
          setDisplay(t("copied"));
          setTimeout(() => {
            setDisplay(t("copy"));
          }, 3000);
        });
      }}
    >
      {display}
    </span>
  );
};

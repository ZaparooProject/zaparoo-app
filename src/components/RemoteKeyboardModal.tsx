import { useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  House,
  Loader2,
  Undo2,
  X,
} from "lucide-react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { SlideModal } from "@/components/SlideModal";
import { Segmented } from "@/components/wui/Segmented";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

type KeyboardLayoutName = "default" | "shift" | "symbols" | "fn";
type RemoteKeyboardMode = "remote" | "keyboard";

type RemoteAction = {
  labelKey: string;
  keys: string;
  ariaLabelKey?: string;
  icon?: ReactElement;
};
type ScreenshotResult = { path: string; data: string; size: number };

const layout: Record<KeyboardLayoutName, string[]> = {
  default: [
    "1 2 3 4 5 6 7 8 9 0 {bksp}",
    "q w e r t y u i o p",
    "a s d f g h j k l {enter}",
    "{shift} z x c v b n m , . /",
    "{symbols} {fn} {space}",
  ],
  shift: [
    "! @ # $ % ^ & * ( ) {bksp}",
    "Q W E R T Y U I O P",
    "A S D F G H J K L {enter}",
    "{default} Z X C V B N M ? ! {backslash}",
    "{symbols} {fn} {space}",
  ],
  symbols: [
    "` ~ - _ = + [ ] {lbrace} {rbrace} {bksp}",
    "; : {quote} {doublequote} < > {backslash} {pipe}",
    "/ ? , . @ # $ % {enter}",
    "{default} {shift} {fn} {space}",
  ],
  fn: [
    "{esc} {tab} {up} {enter}",
    "{left} {down} {right} {bksp}",
    "{f1} {f2} {f3} {f4} {f5} {f6}",
    "{f7} {f8} {f9} {f10} {f11} {f12}",
    "{default} {symbols} {space}",
  ],
};

const display: Record<string, string> = {
  "{bksp}": "⌫",
  "{enter}": "Enter",
  "{shift}": "Shift",
  "{default}": "ABC",
  "{symbols}": "#+=",
  "{fn}": "Fn",
  "{space}": "Space",
  "{esc}": "Esc",
  "{tab}": "Tab",
  "{up}": "↑",
  "{down}": "↓",
  "{left}": "←",
  "{right}": "→",
  "{f1}": "F1",
  "{f2}": "F2",
  "{f3}": "F3",
  "{f4}": "F4",
  "{f5}": "F5",
  "{f6}": "F6",
  "{f7}": "F7",
  "{f8}": "F8",
  "{f9}": "F9",
  "{f10}": "F10",
  "{f11}": "F11",
  "{f12}": "F12",
  "{lbrace}": "{",
  "{rbrace}": "}",
  "{quote}": "'",
  "{doublequote}": '"',
  "{backslash}": "\\",
  "{pipe}": "|",
};

const specialKeyMap: Record<string, string> = {
  "{bksp}": "{backspace}",
  "{enter}": "{enter}",
  "{space}": "{space}",
  "{esc}": "{esc}",
  "{tab}": "{tab}",
  "{up}": "{up}",
  "{down}": "{down}",
  "{left}": "{left}",
  "{right}": "{right}",
  "{f1}": "{f1}",
  "{f2}": "{f2}",
  "{f3}": "{f3}",
  "{f4}": "{f4}",
  "{f5}": "{f5}",
  "{f6}": "{f6}",
  "{f7}": "{f7}",
  "{f8}": "{f8}",
  "{f9}": "{f9}",
  "{f10}": "{f10}",
  "{f11}": "{f11}",
  "{f12}": "{f12}",
  "{lbrace}": "\\{",
  "{rbrace}": "\\}",
  "{quote}": "'",
  "{doublequote}": '"',
  "{backslash}": "\\\\",
  "{pipe}": "|",
};

const layoutSwitches: Record<string, KeyboardLayoutName> = {
  "{shift}": "shift",
  "{default}": "default",
  "{symbols}": "symbols",
  "{fn}": "fn",
};

function escapeKeyboardMacro(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function toKeyboardMacro(button: string): string | null {
  if (button in layoutSwitches) return null;
  return specialKeyMap[button] ?? escapeKeyboardMacro(button);
}

function getScreenshotFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "zaparoo-screenshot.png";
}

function getRemoteActions(platform: string | null): RemoteAction[] {
  const normalizedPlatform = platform?.toLowerCase() ?? "";

  if (
    normalizedPlatform.includes("mister") ||
    normalizedPlatform.includes("mistex")
  ) {
    return [
      {
        labelKey: "remoteKeyboard.back",
        keys: "{esc}",
        icon: <Undo2 size={28} />,
      },
      {
        labelKey: "remoteKeyboard.osd",
        keys: "{f12}",
        icon: <House size={28} />,
      },
    ];
  }

  if (
    normalizedPlatform.includes("batocera") ||
    normalizedPlatform.includes("emulationstation")
  ) {
    return [
      {
        labelKey: "remoteKeyboard.back",
        keys: "{esc}",
        icon: <Undo2 size={28} />,
      },
      { labelKey: "remoteKeyboard.menu", keys: "{space}" },
      { labelKey: "remoteKeyboard.context", keys: "{backspace}" },
      { labelKey: "remoteKeyboard.minus", keys: "-" },
      { labelKey: "remoteKeyboard.equals", keys: "=" },
    ];
  }

  return [
    {
      labelKey: "remoteKeyboard.back",
      keys: "{esc}",
      icon: <Undo2 size={28} />,
    },
    { labelKey: "remoteKeyboard.menu", keys: "{f12}" },
    { labelKey: "remoteKeyboard.start", keys: "{space}" },
    { labelKey: "remoteKeyboard.select", keys: "{backspace}" },
  ];
}

export function RemoteKeyboardModal(props: {
  isOpen: boolean;
  close: () => void;
}) {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const [layoutName, setLayoutName] = useState<KeyboardLayoutName>("default");
  const [mode, setMode] = useState<RemoteKeyboardMode>("remote");
  const [error, setError] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotResult | null>(null);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  const remoteActions = getRemoteActions(corePlatform);
  const modeOptions: { value: RemoteKeyboardMode; label: string }[] = [
    { value: "remote", label: t("remoteKeyboard.remoteMode") },
    { value: "keyboard", label: t("remoteKeyboard.keyboardMode") },
  ];

  const sendMacro = (keys: string) => {
    if (!connected) {
      const message = t("remoteKeyboard.disconnected");
      setError(null);
      toast.error(message);
      return;
    }

    setError(null);
    sendQueueRef.current = sendQueueRef.current
      .catch(() => undefined)
      .then(() => CoreAPI.inputKeyboard({ keys }))
      .catch(() => {
        const message = t("remoteKeyboard.sendError");
        setError(message);
        toast.error(message);
      });
  };

  const handleKeyPress = (button: string) => {
    const nextLayout = layoutSwitches[button];
    if (nextLayout) {
      setLayoutName(nextLayout);
      return;
    }

    const macro = toKeyboardMacro(button);
    if (macro) {
      sendMacro(macro);
    }
  };

  const handleScreenshot = () => {
    if (!connected) {
      const message = t("remoteKeyboard.disconnected");
      setError(null);
      toast.error(message);
      return;
    }

    setError(null);
    setCapturingScreenshot(true);
    CoreAPI.screenshot()
      .then((result) => {
        setScreenshot(result);
      })
      .catch(() => {
        const message = t("remoteKeyboard.screenshotError");
        setError(message);
        toast.error(message);
      })
      .finally(() => setCapturingScreenshot(false));
  };

  const screenshotUrl = screenshot
    ? `data:image/png;base64,${screenshot.data}`
    : null;

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("remoteKeyboard.title")}
    >
      <div className="flex flex-col gap-3 pb-2">
        {!connected && (
          <p role="status" className="text-sm text-red-300">
            {t("remoteKeyboard.disconnected")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <Segmented
          label={t("remoteKeyboard.mode")}
          labelHidden
          options={modeOptions}
          value={mode}
          onChange={setMode}
        />
        {mode === "remote" ? (
          <div className="remote-keyboard-pad">
            <div className="remote-keyboard-dpad">
              <button
                type="button"
                className="remote-keyboard-pad-button remote-keyboard-pad-up"
                aria-label={t("remoteKeyboard.up")}
                onClick={() => sendMacro("{up}")}
              >
                <ChevronUp size={28} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="remote-keyboard-pad-button remote-keyboard-pad-left"
                aria-label={t("remoteKeyboard.left")}
                onClick={() => sendMacro("{left}")}
              >
                <ChevronLeft size={28} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="remote-keyboard-pad-button remote-keyboard-pad-ok"
                onClick={() => sendMacro("{enter}")}
              >
                {t("remoteKeyboard.ok")}
              </button>
              <button
                type="button"
                className="remote-keyboard-pad-button remote-keyboard-pad-right"
                aria-label={t("remoteKeyboard.right")}
                onClick={() => sendMacro("{right}")}
              >
                <ChevronRight size={28} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="remote-keyboard-pad-button remote-keyboard-pad-down"
                aria-label={t("remoteKeyboard.down")}
                onClick={() => sendMacro("{down}")}
              >
                <ChevronDown size={28} aria-hidden="true" />
              </button>
            </div>
            <div className="remote-keyboard-pad-actions">
              {remoteActions.map((action) => (
                <button
                  key={`${action.labelKey}-${action.keys}`}
                  type="button"
                  className="remote-keyboard-pad-action"
                  aria-label={t(action.ariaLabelKey ?? action.labelKey)}
                  onClick={() => sendMacro(action.keys)}
                >
                  {action.icon ?? t(action.labelKey)}
                </button>
              ))}
              <button
                type="button"
                className="remote-keyboard-pad-action"
                aria-label={t("remoteKeyboard.screenshotAction")}
                aria-busy={capturingScreenshot}
                onClick={handleScreenshot}
                disabled={capturingScreenshot}
              >
                {capturingScreenshot ? (
                  <Loader2
                    size={28}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Camera size={28} aria-hidden="true" />
                )}
              </button>
            </div>
            {screenshot && screenshotUrl && (
              <div className="remote-keyboard-screenshot-result">
                <img
                  src={screenshotUrl}
                  alt={t("remoteKeyboard.screenshotAlt")}
                  className="remote-keyboard-screenshot-image"
                />
                <p className="remote-keyboard-screenshot-path">
                  {screenshot.path}
                </p>
                <div className="remote-keyboard-screenshot-actions">
                  <a
                    className="remote-keyboard-screenshot-control"
                    href={screenshotUrl}
                    download={getScreenshotFileName(screenshot.path)}
                  >
                    <Download size={20} aria-hidden="true" />
                    {t("remoteKeyboard.screenshotDownload")}
                  </a>
                  <button
                    type="button"
                    className="remote-keyboard-screenshot-control"
                    onClick={() => setScreenshot(null)}
                  >
                    <X size={20} aria-hidden="true" />
                    {t("remoteKeyboard.screenshotClear")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="remote-keyboard-wrapper">
            <Keyboard
              layout={layout}
              layoutName={layoutName}
              display={display}
              onKeyPress={handleKeyPress}
              disableButtonHold
              theme="hg-theme-default remote-keyboard"
            />
          </div>
        )}
      </div>
    </SlideModal>
  );
}

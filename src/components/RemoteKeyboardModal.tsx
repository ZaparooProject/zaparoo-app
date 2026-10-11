import { useCallback, useId, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  House,
  Share2,
  Undo2,
  XIcon,
} from "lucide-react";
import Keyboard from "react-simple-keyboard/build/index.modern.esm.js";
import "react-simple-keyboard/build/css/index.css";
import { SlideModal } from "@/components/SlideModal";
import { TabBar } from "@/components/wui/TabBar";
import { Button } from "@/components/wui/Button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useTactilePress } from "@/hooks/useTactilePress";
import { getTabBarPanelId, getTabBarTabId } from "@/components/wui/tabBarIds";
import { CoreAPI, getScreenshotFailureKind } from "@/lib/coreApi";
import { useHaptics } from "@/hooks/useHaptics";
import { logger } from "@/lib/logger";
import { useStatusStore } from "@/lib/store";
import { useLiveCoreControls } from "@/hooks/useLiveCoreControls";
import { useCoreFeature } from "@/hooks/useCoreFeature";

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

function isShareCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /cancel(?:ed|led)?/i.test(error.message);
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
  docked?: boolean;
}) {
  const { t } = useTranslation();
  const { impact } = useHaptics();
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const [layoutName, setLayoutName] = useState<KeyboardLayoutName>("default");
  const [mode, setMode] = useState<RemoteKeyboardMode>("remote");
  const tabPrefix = useId();
  const [error, setError] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotResult | null>(null);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const captureRequestRef = useRef<symbol | null>(null);
  const invalidatePending = useCallback(() => {
    sendQueueRef.current = Promise.resolve();
    captureRequestRef.current = null;
    setCapturingScreenshot(false);
    setError(null);
  }, []);
  const controls = useLiveCoreControls(invalidatePending);
  const connected = controls.available;
  const remoteFeature = useCoreFeature("remoteInput");
  const enabled = connected && remoteFeature.available;
  const downloadPress = useTactilePress({ hasOnClick: true });

  const isNative = Capacitor.isNativePlatform();
  const remoteActions = getRemoteActions(corePlatform);
  const modeOptions = [
    {
      value: "remote" as const,
      label: t("remoteKeyboard.remoteMode"),
      id: getTabBarTabId("remote", tabPrefix),
    },
    {
      value: "keyboard" as const,
      label: t("remoteKeyboard.keyboardMode"),
      id: getTabBarTabId("keyboard", tabPrefix),
    },
  ];
  const activeTabId = getTabBarTabId(mode, tabPrefix);
  const activePanelProps = {
    role: "tabpanel",
    id: getTabBarPanelId(activeTabId),
    "aria-labelledby": activeTabId,
  };

  const triggerControlHaptic = () => {
    impact("light");
  };

  const sendMacro = (keys: string, withHaptic = true) => {
    if (withHaptic) triggerControlHaptic();

    const target = controls.captureTarget();
    if (!target || !remoteFeature.available) return;

    setError(null);
    sendQueueRef.current = sendQueueRef.current
      .catch(() => undefined)
      .then(() => {
        if (controls.isCurrentTarget(target)) {
          return CoreAPI.inputKeyboard({ keys });
        }
      })
      .catch((error) => {
        if (!controls.isCurrentTarget(target)) return;
        const message = t("remoteKeyboard.sendError");
        logger.error(message, error, {
          category: "api",
          action: "remoteKeyboard.send",
          severity: "error",
        });
        setError(message);
        toast.error(message);
      });
  };

  const handleKeyPress = (button: string) => {
    const nextLayout = layoutSwitches[button];
    if (nextLayout) {
      triggerControlHaptic();
      setLayoutName(nextLayout);
      return;
    }

    const macro = toKeyboardMacro(button);
    if (macro) {
      sendMacro(macro);
    }
  };

  const handleScreenshot = () => {
    const target = controls.captureTarget();
    if (!target || !remoteFeature.available || captureRequestRef.current)
      return;
    const request = Symbol("screenshot");
    captureRequestRef.current = request;
    setError(null);
    setCapturingScreenshot(true);
    CoreAPI.screenshot()
      .then((result) => {
        if (controls.isCurrentTarget(target)) setScreenshot(result);
      })
      .catch((error) => {
        if (!controls.isCurrentTarget(target)) return;
        const message = t("remoteKeyboard.screenshotError");
        const failureKind = getScreenshotFailureKind(error);
        if (failureKind === "unavailable") {
          logger.warn(message, error);
        } else {
          logger.error(message, error, {
            category: "api",
            action: "remoteKeyboard.screenshot",
            severity: failureKind === "timeout" ? "warning" : "error",
          });
        }
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (captureRequestRef.current === request) {
          captureRequestRef.current = null;
          setCapturingScreenshot(false);
        }
      });
  };

  const shareScreenshot = async () => {
    if (!Capacitor.isNativePlatform() || !screenshot) return;

    try {
      const filename = getScreenshotFileName(screenshot.path);
      await Filesystem.writeFile({
        path: filename,
        data: screenshot.data,
        directory: Directory.Cache,
      });
      const fileUri = await Filesystem.getUri({
        path: filename,
        directory: Directory.Cache,
      });
      await Share.share({
        title: t("remoteKeyboard.screenshotShareTitle"),
        dialogTitle: t("remoteKeyboard.screenshotShareTitle"),
        files: [fileUri.uri],
      });
    } catch (error) {
      if (isShareCancel(error)) return;

      const message = t("remoteKeyboard.screenshotShareError");
      logger.error(message, error, {
        category: "share",
        action: "remoteKeyboard.screenshotShare",
        severity: "warning",
      });
      toast.error(message);
    }
  };

  const screenshotUrl = screenshot
    ? `data:image/png;base64,${screenshot.data}`
    : null;

  return (
    <SlideModal
      isOpen={Boolean(props.docked || props.isOpen)}
      close={props.close}
      title={t("remoteKeyboard.title")}
      presentation={props.docked ? "pane" : "modal"}
      paneLayout="section"
      dismissible={!props.docked}
      suspendWhenCovered
      className={props.docked ? "zap-remote-surface" : undefined}
    >
      <div
        className={
          props.docked
            ? "wui-card border-border flex flex-col gap-3 rounded-lg border border-solid p-4"
            : "flex flex-col gap-3 pb-2"
        }
      >
        {!connected && !props.docked && (
          <p role="status" className="text-error text-sm">
            {t("remoteKeyboard.disconnected")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-error text-sm">
            {error}
          </p>
        )}
        <TabBar
          label={t("remoteKeyboard.mode")}
          options={modeOptions}
          value={mode}
          onChange={(next) => {
            triggerControlHaptic();
            setMode(next);
          }}
        />
        {mode === "remote" ? (
          <div className="remote-keyboard-pad" {...activePanelProps}>
            <div className="remote-keyboard-dpad">
              <Button
                variant="secondary"
                shape="square"
                className="remote-keyboard-pad-up min-h-16 w-full max-w-none min-w-16"
                disabled={!enabled}
                aria-label={t("remoteKeyboard.up")}
                onClick={() => sendMacro("{up}", false)}
                icon={<ChevronUp size={28} />}
              />
              <Button
                variant="secondary"
                shape="square"
                className="remote-keyboard-pad-left min-h-16 w-full max-w-none min-w-16"
                disabled={!enabled}
                aria-label={t("remoteKeyboard.left")}
                onClick={() => sendMacro("{left}", false)}
                icon={<ChevronLeft size={28} />}
              />
              <Button
                variant="secondary"
                size="sm"
                className="remote-keyboard-pad-ok min-h-16 w-full max-w-none min-w-16"
                disabled={!enabled}
                label={t("remoteKeyboard.ok")}
                onClick={() => sendMacro("{enter}", false)}
              />
              <Button
                variant="secondary"
                shape="square"
                className="remote-keyboard-pad-right min-h-16 w-full max-w-none min-w-16"
                disabled={!enabled}
                aria-label={t("remoteKeyboard.right")}
                onClick={() => sendMacro("{right}", false)}
                icon={<ChevronRight size={28} />}
              />
              <Button
                variant="secondary"
                shape="square"
                className="remote-keyboard-pad-down min-h-16 w-full max-w-none min-w-16"
                disabled={!enabled}
                aria-label={t("remoteKeyboard.down")}
                onClick={() => sendMacro("{down}", false)}
                icon={<ChevronDown size={28} />}
              />
            </div>
            <div className="remote-keyboard-pad-actions">
              {remoteActions.map((action) => (
                <Button
                  key={`${action.labelKey}-${action.keys}`}
                  variant="secondary"
                  shape="square"
                  size="sm"
                  className="min-h-16 min-w-16"
                  aria-label={t(action.ariaLabelKey ?? action.labelKey)}
                  disabled={!enabled}
                  onClick={() => sendMacro(action.keys, false)}
                  icon={action.icon}
                  label={action.icon ? undefined : t(action.labelKey)}
                />
              ))}
              <Button
                variant="secondary"
                shape="square"
                className="min-h-16 min-w-16"
                aria-label={t("remoteKeyboard.screenshotAction")}
                aria-busy={capturingScreenshot}
                onClick={handleScreenshot}
                disabled={!enabled || capturingScreenshot}
                disabledAppearance={
                  capturingScreenshot ? "busy" : "unavailable"
                }
                icon={
                  capturingScreenshot ? (
                    <LoadingSpinner size={28} decorative />
                  ) : (
                    <Camera size={28} />
                  )
                }
              />
            </div>
            {screenshot && screenshotUrl && (
              <div className="remote-keyboard-screenshot-result">
                <img
                  src={screenshotUrl}
                  alt={t("remoteKeyboard.screenshotAlt")}
                  className="remote-keyboard-screenshot-image"
                />
                <div className="remote-keyboard-screenshot-actions">
                  {isNative ? (
                    <Button
                      variant="secondary"
                      className="w-full max-w-none min-w-0"
                      icon={<Share2 size={20} />}
                      label={t("remoteKeyboard.screenshotShare")}
                      onClick={() => void shareScreenshot()}
                    />
                  ) : (
                    <a
                      className="wui-button flex min-h-12 min-w-0 touch-manipulation items-center justify-center gap-2 border border-solid border-transparent px-5 py-3 text-sm font-bold tracking-wider uppercase"
                      data-variant="secondary"
                      data-intent="default"
                      data-pressed={downloadPress.pressed}
                      {...downloadPress.handlers}
                      onClick={(event) => {
                        if (!downloadPress.shouldFireClick())
                          event.preventDefault();
                      }}
                      href={screenshotUrl}
                      download={getScreenshotFileName(screenshot.path)}
                    >
                      <span
                        className="wui-button-icon flex shrink-0 items-center"
                        aria-hidden="true"
                      >
                        <Download size={20} />
                      </span>
                      {t("remoteKeyboard.screenshotDownload")}
                    </a>
                  )}
                  <Button
                    variant="secondary"
                    className="w-full max-w-none min-w-0"
                    icon={<XIcon size={20} />}
                    label={t("remoteKeyboard.screenshotClear")}
                    onClick={() => setScreenshot(null)}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="remote-keyboard-wrapper" {...activePanelProps}>
            <fieldset
              className="min-w-0 border-0 p-0"
              disabled={!enabled}
              aria-label={t("remoteKeyboard.keyboardMode")}
            >
              <Keyboard
                layout={layout}
                layoutName={layoutName}
                display={display}
                onKeyPress={handleKeyPress}
                disableButtonHold
                useButtonTag
                buttonTheme={[
                  {
                    class: "wui-button",
                    buttons: layout[layoutName].join(" "),
                  },
                ]}
                buttonAttributes={[
                  {
                    attribute: "data-variant",
                    value: "outline",
                    buttons: layout[layoutName].join(" "),
                  },
                ]}
                theme="hg-theme-default remote-keyboard"
              />
            </fieldset>
          </div>
        )}
      </div>
    </SlideModal>
  );
}

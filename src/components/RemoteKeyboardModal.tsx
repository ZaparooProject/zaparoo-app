import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
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
  Loader2,
  Share2,
  Undo2,
  X,
} from "lucide-react";
import Keyboard from "react-simple-keyboard/build/index.modern.esm.js";
import "react-simple-keyboard/build/css/index.css";
import { SlideModal } from "@/components/SlideModal";
import { Segmented } from "@/components/wui/Segmented";
import { CoreAPI, getScreenshotFailureKind } from "@/lib/coreApi";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHaptics } from "@/hooks/useHaptics";
import { useHeldRemoteInput } from "@/hooks/useHeldRemoteInput";
import { logger } from "@/lib/logger";
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

function RemotePadButton(props: {
  keys: string;
  className: string;
  ariaLabel?: string;
  holdInput: boolean;
  held: boolean;
  onTap: (keys: string) => void;
  onPress: (keys: string, pointerId: number) => void;
  onRelease: (pointerId: number) => void;
  children: ReactNode;
}) {
  // A pointer press already sent its input, so its click is ignored. Clicks
  // without one, from a keyboard or screen reader, still send a tap.
  const pointerPressedRef = useRef(false);

  if (!props.holdInput) {
    return (
      <button
        type="button"
        className={props.className}
        aria-label={props.ariaLabel}
        onClick={() => props.onTap(props.keys)}
      >
        {props.children}
      </button>
    );
  }

  const releasePointer = (event: PointerEvent<HTMLButtonElement>) => {
    props.onRelease(event.pointerId);
  };

  return (
    <button
      type="button"
      className={props.className}
      aria-label={props.ariaLabel}
      data-held={props.held ? "true" : undefined}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointerPressedRef.current = true;
        try {
          // Keep the release on this button if the finger slides off it.
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer is already gone; its pointerup still releases the key.
        }
        props.onPress(props.keys, event.pointerId);
      }}
      onPointerUp={releasePointer}
      onPointerCancel={(event) => {
        pointerPressedRef.current = false;
        releasePointer(event);
      }}
      onLostPointerCapture={releasePointer}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (pointerPressedRef.current) {
          pointerPressedRef.current = false;
          return;
        }
        props.onTap(props.keys);
      }}
    >
      {props.children}
    </button>
  );
}

export function RemoteKeyboardModal(props: {
  isOpen: boolean;
  close: () => void;
}) {
  const { t } = useTranslation();
  const { impact } = useHaptics();
  const connected = useStatusStore((state) => state.connected);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const [layoutName, setLayoutName] = useState<KeyboardLayoutName>("default");
  const [mode, setMode] = useState<RemoteKeyboardMode>("remote");
  const [error, setError] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotResult | null>(null);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const heldInput = useCoreFeature("heldInput", { requireKnownSupport: true });

  const isNative = Capacitor.isNativePlatform();
  const remoteActions = getRemoteActions(corePlatform);
  const modeOptions: { value: RemoteKeyboardMode; label: string }[] = [
    { value: "remote", label: t("remoteKeyboard.remoteMode") },
    { value: "keyboard", label: t("remoteKeyboard.keyboardMode") },
  ];

  const triggerControlHaptic = () => {
    impact("light");
  };

  const handleDisconnected = useCallback(() => {
    setError(null);
    toast.error(t("remoteKeyboard.disconnected"));
  }, [t]);

  const handleSendError = useCallback(
    (error: unknown) => {
      const message = t("remoteKeyboard.sendError");
      logger.error(message, error, {
        category: "api",
        action: "remoteKeyboard.send",
        severity: "error",
      });
      setError(message);
      toast.error(message);
    },
    [t],
  );

  const remoteInput = useHeldRemoteInput({
    heldInputAvailable: heldInput.available,
    onDisconnected: handleDisconnected,
    onError: handleSendError,
  });
  const { releaseAll } = remoteInput;

  useEffect(() => {
    if (!props.isOpen) releaseAll();
  }, [props.isOpen, releaseAll]);

  const sendMacro = (keys: string) => {
    triggerControlHaptic();
    setError(null);
    remoteInput.sendTap(keys);
  };

  const pressRemoteKey = (keys: string, pointerId: number) => {
    triggerControlHaptic();
    setError(null);
    remoteInput.press(keys, pointerId);
  };

  const remotePadButtonProps = {
    holdInput: heldInput.available,
    onTap: sendMacro,
    onPress: pressRemoteKey,
    onRelease: remoteInput.release,
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
    triggerControlHaptic();

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
      .catch((error) => {
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
      .finally(() => setCapturingScreenshot(false));
  };

  const shareScreenshot = async () => {
    triggerControlHaptic();

    if (!screenshot) return;

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
          onChange={(next) => {
            triggerControlHaptic();
            // Leaving the pad unmounts its buttons before they see a pointerup.
            if (next !== "remote") releaseAll();
            setMode(next);
          }}
        />
        {mode === "remote" ? (
          <div
            className="remote-keyboard-pad"
            data-hold-input={heldInput.available ? "true" : undefined}
          >
            <div className="remote-keyboard-dpad">
              <RemotePadButton
                {...remotePadButtonProps}
                keys="{up}"
                held={remoteInput.heldKeys.has("{up}")}
                className="remote-keyboard-pad-button remote-keyboard-pad-up"
                ariaLabel={t("remoteKeyboard.up")}
              >
                <ChevronUp size={28} aria-hidden="true" />
              </RemotePadButton>
              <RemotePadButton
                {...remotePadButtonProps}
                keys="{left}"
                held={remoteInput.heldKeys.has("{left}")}
                className="remote-keyboard-pad-button remote-keyboard-pad-left"
                ariaLabel={t("remoteKeyboard.left")}
              >
                <ChevronLeft size={28} aria-hidden="true" />
              </RemotePadButton>
              <RemotePadButton
                {...remotePadButtonProps}
                keys="{enter}"
                held={remoteInput.heldKeys.has("{enter}")}
                className="remote-keyboard-pad-button remote-keyboard-pad-ok"
              >
                {t("remoteKeyboard.ok")}
              </RemotePadButton>
              <RemotePadButton
                {...remotePadButtonProps}
                keys="{right}"
                held={remoteInput.heldKeys.has("{right}")}
                className="remote-keyboard-pad-button remote-keyboard-pad-right"
                ariaLabel={t("remoteKeyboard.right")}
              >
                <ChevronRight size={28} aria-hidden="true" />
              </RemotePadButton>
              <RemotePadButton
                {...remotePadButtonProps}
                keys="{down}"
                held={remoteInput.heldKeys.has("{down}")}
                className="remote-keyboard-pad-button remote-keyboard-pad-down"
                ariaLabel={t("remoteKeyboard.down")}
              >
                <ChevronDown size={28} aria-hidden="true" />
              </RemotePadButton>
            </div>
            <div className="remote-keyboard-pad-actions">
              {remoteActions.map((action) => (
                <RemotePadButton
                  {...remotePadButtonProps}
                  key={`${action.labelKey}-${action.keys}`}
                  keys={action.keys}
                  held={remoteInput.heldKeys.has(action.keys)}
                  className="remote-keyboard-pad-action"
                  ariaLabel={t(action.ariaLabelKey ?? action.labelKey)}
                >
                  {action.icon ?? t(action.labelKey)}
                </RemotePadButton>
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
                <div className="remote-keyboard-screenshot-actions">
                  {isNative ? (
                    <button
                      type="button"
                      className="remote-keyboard-screenshot-control"
                      onClick={shareScreenshot}
                    >
                      <Share2 size={20} aria-hidden="true" />
                      {t("remoteKeyboard.screenshotShare")}
                    </button>
                  ) : (
                    <a
                      className="remote-keyboard-screenshot-control"
                      href={screenshotUrl}
                      download={getScreenshotFileName(screenshot.path)}
                    >
                      <Download size={20} aria-hidden="true" />
                      {t("remoteKeyboard.screenshotDownload")}
                    </a>
                  )}
                  <button
                    type="button"
                    className="remote-keyboard-screenshot-control"
                    onClick={() => {
                      triggerControlHaptic();
                      setScreenshot(null);
                    }}
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
              useButtonTag
              theme="hg-theme-default remote-keyboard"
            />
          </div>
        )}
      </div>
    </SlideModal>
  );
}

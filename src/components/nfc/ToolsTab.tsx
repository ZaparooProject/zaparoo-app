import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ReactNode } from "react";
import {
  EraserIcon,
  PencilOffIcon,
  SquareAsteriskIcon,
  ShieldIcon,
  AlertTriangleIcon,
  InfoIcon,
  CheckCircleIcon
} from "lucide-react";
import { Button } from "@/components/wui/Button";
import { WriteAction } from "@/lib/writeNfcHook";

interface ToolsTabProps {
  onToolAction: (action: WriteAction) => void;
  isProcessing: boolean;
}

interface Tool {
  action: WriteAction;
  label: string;
  icon: ReactNode;
  description: string;
  warning: string;
  platforms: string[];
  dangerous: boolean;
}

export function ToolsTab({ onToolAction, isProcessing }: ToolsTabProps) {
  const { t } = useTranslation();
  const [confirmingAction, setConfirmingAction] = useState<WriteAction | null>(null);

  const tools: Tool[] = [
    {
      action: WriteAction.Format,
      label: t("create.nfc.format"),
      icon: <SquareAsteriskIcon size={20} />,
      description: "Formats the tag to NDEF standard, removing all data",
      warning: "This will permanently delete all data on the tag",
      platforms: ["android"],
      dangerous: true
    },
    {
      action: WriteAction.Erase,
      label: t("create.nfc.erase"),
      icon: <EraserIcon size={20} />,
      description: "Removes all NDEF data from the tag",
      warning: "This will delete all content but keep the tag structure",
      platforms: ["android", "ios"],
      dangerous: true
    },
    {
      action: WriteAction.MakeReadOnly,
      label: t("create.nfc.makeReadOnly"),
      icon: <PencilOffIcon size={20} />,
      description: "Permanently locks the tag to prevent future writes",
      warning: "This action cannot be undone - the tag will become read-only forever",
      platforms: ["android", "ios"],
      dangerous: true
    }
  ];

  const currentPlatform = Capacitor.getPlatform();
  const availableTools = tools.filter(tool =>
    tool.platforms.includes(currentPlatform) || tool.platforms.includes("all")
  );

  const handleToolClick = (action: WriteAction) => {
    const tool = tools.find(t => t.action === action);
    if (!tool?.dangerous) {
      onToolAction(action);
      return;
    }

    if (confirmingAction === action) {
      onToolAction(action);
      setConfirmingAction(null);
    } else {
      setConfirmingAction(action);
      setTimeout(() => {
        setConfirmingAction(null);
      }, 5000);
    }
  };

  if (availableTools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <InfoIcon size={48} className="text-foreground-secondary mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Tools Available</h3>
        <p className="text-foreground-secondary max-w-sm">
          Advanced NFC tools are not available on this platform.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-amber-800">
            <p className="font-medium text-sm mb-1">Dangerous Operations</p>
            <p className="text-xs">
              These tools perform irreversible operations on NFC tags.
              Use with caution and ensure you have the correct tag.
            </p>
          </div>
        </div>
      </div>

      {/* Tools */}
      <div className="space-y-4">
        {availableTools.map((tool) => {
          const isConfirming = confirmingAction === tool.action;
          const isCurrentlyProcessing = isProcessing && confirmingAction === tool.action;

          return (
            <div key={tool.action} className="space-y-3">
              <div className={`border-2 rounded-xl p-4 transition-all ${
                tool.dangerous
                  ? "border-red-200 bg-red-50"
                  : "border-bd-outline bg-background-secondary/50"
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    tool.dangerous ? "bg-red-100" : "bg-blue-100"
                  }`}>
                    {tool.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-1">{tool.label}</h3>
                    <p className="text-xs text-foreground-secondary mb-2">
                      {tool.description}
                    </p>

                    {tool.dangerous && (
                      <div className="flex items-start gap-1 mb-3">
                        <ShieldIcon size={12} className="text-red-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-red-700 font-medium">
                          {tool.warning}
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={() => handleToolClick(tool.action)}
                      disabled={isCurrentlyProcessing}
                      label={
                        isCurrentlyProcessing
                          ? "Processing..."
                          : isConfirming
                            ? "Confirm Action"
                            : tool.label
                      }
                      icon={isConfirming ? <CheckCircleIcon size={16} /> : <>{tool.icon}</>}
                      variant={isConfirming ? "fill" : "outline"}
                      size="sm"
                      className={isConfirming ? "bg-red-600 border-red-600" : ""}
                    />

                    {isConfirming && (
                      <p className="text-xs text-red-600 mt-2 font-medium">
                        Click again within 5 seconds to confirm
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <InfoIcon size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Platform: {currentPlatform}</p>
            <div className="text-xs space-y-1">
              {currentPlatform === "android" && (
                <p>• All NFC tools available on Android</p>
              )}
              {currentPlatform === "ios" && (
                <p>• Limited NFC tools available on iOS</p>
              )}
              {currentPlatform === "web" && (
                <p>• NFC tools require a mobile device</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
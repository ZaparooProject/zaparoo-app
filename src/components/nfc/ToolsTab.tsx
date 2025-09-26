import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ReactElement } from "react";
import {
  EraserIcon,
  PencilOffIcon,
  SquareAsteriskIcon,
  AlertTriangleIcon
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
  icon: ReactElement;
  description: string;
  warning: string;
  platforms: string[];
  dangerous: boolean;
}

export function ToolsTab({ onToolAction, isProcessing }: ToolsTabProps) {
  const { t } = useTranslation();

  const tools: Tool[] = [
    {
      action: WriteAction.Format,
      label: t("create.nfc.format"),
      icon: <SquareAsteriskIcon size={20} />,
      description: t("create.nfc.tools.formatDescription"),
      warning: t("create.nfc.tools.formatWarning"),
      platforms: ["android"],
      dangerous: true
    },
    {
      action: WriteAction.Erase,
      label: t("create.nfc.erase"),
      icon: <EraserIcon size={20} />,
      description: t("create.nfc.tools.eraseDescription"),
      warning: t("create.nfc.tools.eraseWarning"),
      platforms: ["android", "ios"],
      dangerous: true
    },
    {
      action: WriteAction.MakeReadOnly,
      label: t("create.nfc.makeReadOnly"),
      icon: <PencilOffIcon size={20} />,
      description: t("create.nfc.tools.makeReadOnlyDescription"),
      warning: t("create.nfc.tools.makeReadOnlyWarning"),
      platforms: ["android", "ios"],
      dangerous: true
    }
  ];

  const currentPlatform = Capacitor.getPlatform();
  const availableTools = tools.filter(tool =>
    tool.platforms.includes(currentPlatform) || tool.platforms.includes("all")
  );

  const handleToolClick = (action: WriteAction) => {
    if (typeof onToolAction === 'function') {
      onToolAction(action);
    }
  };

  return (
    <div className="space-y-4 px-2 pt-4">
      {/* Tools */}
      {availableTools.map((tool) => {
        return (
          <div key={tool.action} className="bg-background-secondary/50 space-y-4 rounded-2xl p-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">{tool.label}</h3>
              <p className="text-foreground-secondary text-sm mb-3">
                {tool.description}
              </p>

              {tool.dangerous && (
                <div className="flex items-start gap-2 mb-4">
                  <AlertTriangleIcon size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600 font-medium">
                    {tool.warning}
                  </p>
                </div>
              )}

              <Button
                onClick={() => handleToolClick(tool.action)}
                disabled={isProcessing}
                label={isProcessing ? t("loading") : tool.label}
                icon={tool.icon}
                variant="outline"
                className="w-full"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
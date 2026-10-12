import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ReactElement, type ReactNode } from "react";
import {
  EraserIcon,
  PencilOffIcon,
  SquareAsteriskIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { WriteAction } from "@/lib/writeNfcHook";

interface ToolsTabProps {
  /** Each tool's reader control, owned by the page's reader session. */
  renderToolControl: (tool: {
    action: WriteAction;
    label: string;
    icon: ReactElement;
  }) => ReactNode;
}

interface Tool {
  action: WriteAction;
  label: string;
  icon: ReactElement;
  description: string;
  warning: string;
  platforms: string[];
}

export function ToolsTab({ renderToolControl }: ToolsTabProps) {
  const { t } = useTranslation();

  const tools: Tool[] = [
    {
      action: WriteAction.Format,
      label: t("create.nfc.format"),
      icon: <SquareAsteriskIcon size={20} />,
      description: t("create.nfc.tools.formatDescription"),
      warning: t("create.nfc.tools.formatWarning"),
      platforms: ["android"],
    },
    {
      action: WriteAction.Erase,
      label: t("create.nfc.erase"),
      icon: <EraserIcon size={20} />,
      description: t("create.nfc.tools.eraseDescription"),
      warning: t("create.nfc.tools.eraseWarning"),
      platforms: ["android", "ios"],
    },
    {
      action: WriteAction.MakeReadOnly,
      label: t("create.nfc.makeReadOnly"),
      icon: <PencilOffIcon size={20} />,
      description: t("create.nfc.tools.makeReadOnlyDescription"),
      warning: t("create.nfc.tools.makeReadOnlyWarning"),
      platforms: ["android", "ios"],
    },
  ];

  const currentPlatform = Capacitor.getPlatform();
  const availableTools = tools.filter((tool) =>
    tool.platforms.includes(currentPlatform),
  );

  return (
    <div className="nfc-tools-grid px-2 pt-4">
      {/* Tools */}
      {availableTools.map((tool) => {
        return (
          <div
            key={tool.action}
            className="bg-surface-raised space-y-4 rounded-lg p-4"
          >
            <div>
              <h3 className="mb-1 text-lg font-semibold">{tool.label}</h3>
              <p className="text-muted-foreground mb-3 text-sm">
                {tool.description}
              </p>

              {renderToolControl(tool)}

              <div className="mt-3 flex items-start gap-2">
                <AlertTriangleIcon
                  size={16}
                  aria-hidden="true"
                  className="text-error mt-0.5 flex-shrink-0"
                />
                <p className="text-error text-sm font-medium">{tool.warning}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

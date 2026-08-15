import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { memo } from "react";
import { SettingsIcon } from "@/lib/images";
import {
  activeAddressOf,
  useDeviceRegistry,
} from "@/lib/devices/deviceRegistry";
import { useStatusStore } from "@/lib/store";
import { Card } from "../wui/Card";
import { ConnectionStatusDisplay } from "../ConnectionStatusDisplay";

export const ConnectionStatus = memo(function ConnectionStatus() {
  const { t } = useTranslation();
  const address = useDeviceRegistry(activeAddressOf);
  const connectionError = useStatusStore((state) => state.connectionError);

  // Zap page shows IP address as subtitle
  const connectedSubtitle = address
    ? t("scan.connectedSub", { ip: address })
    : undefined;

  return (
    <section aria-labelledby="connection-status-heading">
      <Card className="mb-4">
        <ConnectionStatusDisplay
          headingId="connection-status-heading"
          connectionError={connectionError}
          connectedSubtitle={connectedSubtitle}
          action={
            <Link
              to="/settings"
              search={{ focus: "address" }}
              aria-label={t("nav.settings")}
              className="focus-visible:ring-offset-background flex h-10 w-10 min-w-10 items-center justify-center rounded-full px-1.5 text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <SettingsIcon size="24" aria-hidden="true" />
            </Link>
          }
        />
      </Card>
    </section>
  );
});

import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { memo } from "react";
import { getDeviceAddress } from "@/lib/coreApi";
import { SettingsIcon } from "@/lib/images";
import { useStatusStore } from "@/lib/store";
import { Button } from "../wui/Button";
import { Card } from "../wui/Card";
import { ConnectionStatusDisplay } from "../ConnectionStatusDisplay";

export const ConnectionStatus = memo(function ConnectionStatus() {
  const { t } = useTranslation();
  const address = getDeviceAddress();
  const connectionError = useStatusStore((state) => state.connectionError);

  // Zap page shows IP address as subtitle
  const connectedSubtitle = address
    ? t("scan.connectedSub", { ip: address })
    : undefined;

  return (
    <section aria-labelledby="connection-status-heading">
      <Card className="mb-4">
        <ConnectionStatusDisplay
          connectionError={connectionError}
          connectedSubtitle={connectedSubtitle}
          action={
            <Link
              to="/settings"
              search={{ focus: "address" }}
              aria-label={t("nav.settings")}
            >
              <Button icon={<SettingsIcon size="24" />} variant="text" />
            </Link>
          }
        />
      </Card>
    </section>
  );
});

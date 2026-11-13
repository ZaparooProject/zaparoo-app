import { BluetoothIcon, WifiIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TransportLink } from "@/lib/transport/types";

interface ConnectionLinkIconProps {
  link: TransportLink;
  className?: string;
}

/** How the app is reaching the device right now: Wi-Fi or Bluetooth. */
export function ConnectionLinkIcon({
  link,
  className = "h-4 w-4 shrink-0",
}: ConnectionLinkIconProps) {
  const { t } = useTranslation();
  const label = t(
    link === "bluetooth" ? "connection.linkBluetooth" : "connection.linkWifi",
  );
  const Icon = link === "bluetooth" ? BluetoothIcon : WifiIcon;
  return <Icon className={className} role="img" aria-label={label} />;
}

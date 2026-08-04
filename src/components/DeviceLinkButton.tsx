import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/wui/Button";
import {
  useDeviceLinking,
  type DeviceLinkState,
} from "@/hooks/useDeviceLinking";
import { isCoreFeatureAvailable } from "@/lib/featureGates";
import { useStatusStore } from "@/lib/store";

interface DeviceLinkButtonProps {
  enabled: boolean;
  onStateChange?: (state: DeviceLinkState) => void;
}

export function DeviceLinkButton({
  enabled,
  onStateChange,
}: DeviceLinkButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const supported = isCoreFeatureAvailable("deviceLinking", coreVersion);
  const available = enabled && supported;
  const { state, linkDevice } = useDeviceLinking(available);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  if (!enabled) return null;

  if (!supported) {
    return (
      <Button
        label={t("online.deviceLink.updateCore")}
        disabled
        className="w-full"
      />
    );
  }

  if (state === "unavailable") return null;

  if (state === "checking" || state === "linking") {
    return (
      <Button
        label={t(
          state === "checking"
            ? "online.deviceLink.checking"
            : "online.deviceLink.linking",
        )}
        icon={<Loader2 size={20} className="animate-spin" aria-hidden="true" />}
        disabled
        className="w-full"
      />
    );
  }

  if (state === "linked") {
    return (
      <Button
        label={t("online.deviceLink.linked")}
        disabled
        className="w-full"
      />
    );
  }

  if (loggedInUser === null) {
    return (
      <Button
        label={t("online.deviceLink.signIn")}
        onClick={() => router.navigate({ to: "/settings/online" })}
        intent="primary"
        className="w-full"
      />
    );
  }

  return (
    <Button
      label={t("online.deviceLink.link")}
      onClick={linkDevice}
      intent="primary"
      className="w-full"
    />
  );
}

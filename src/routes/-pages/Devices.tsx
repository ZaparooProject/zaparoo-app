import { useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { Pencil } from "lucide-react";
import { useStatusStore } from "@/lib/store";
import { useConnection } from "@/hooks/useConnection";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import { getDeviceAddress } from "@/lib/coreApi";
import { credentialStore, normalizeDeviceKey } from "@/lib/crypto/credentials";
import { encodeDeviceAddress } from "@/lib/deviceUrl";
import { logger } from "@/lib/logger";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { BackIcon } from "@/lib/images";
import { DeviceRow } from "@/components/DeviceRow";

export function Devices() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.deviceHistory"),
  );
  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const deviceHistory = useStatusStore((s) => s.deviceHistory);
  const setDeviceHistory = useStatusStore((s) => s.setDeviceHistory);
  const { isConnected } = useConnection();
  const savedAddress = getDeviceAddress();
  const activeKey =
    isConnected && savedAddress ? normalizeDeviceKey(savedAddress) : null;

  const { selectDevice } = useSelectDevice();
  const [pairedKeys, setPairedKeys] = useState<Set<string>>(new Set());

  // Hydrate from Preferences in case the user reaches this page before
  // ConnectionProvider has populated deviceHistory (e.g. offline deep-link).
  // Only seed when the in-memory store is empty so we never clobber newer
  // metadata that ConnectionProvider may have already written.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (useStatusStore.getState().deviceHistory.length > 0) return;
      try {
        const v = await Preferences.get({ key: "deviceHistory" });
        if (cancelled || !v.value) return;
        if (useStatusStore.getState().deviceHistory.length > 0) return;
        setDeviceHistory(JSON.parse(v.value));
      } catch (err) {
        logger.error("Failed to hydrate deviceHistory", err, {
          category: "storage",
          action: "hydrateDeviceHistory",
          severity: "warning",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setDeviceHistory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await credentialStore.list();
        if (cancelled) return;
        setPairedKeys(new Set(entries.map((e) => e.deviceKey)));
      } catch (err) {
        if (cancelled) return;
        logger.warn("Failed to list paired credentials", err, {
          category: "storage",
          action: "listCredentials",
          severity: "warning",
        });
        setPairedKeys(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedHistory = useMemo(() => {
    return deviceHistory
      .slice()
      .sort((a, b) => (a.name || a.address).localeCompare(b.name || b.address));
  }, [deviceHistory]);

  const handleSelect = (address: string) => {
    selectDevice(address);
    router.navigate({ to: "/settings" });
  };

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("settings.deviceHistory")}
        </h1>
      }
    >
      <div className="flex flex-col gap-3 pt-2">
        {sortedHistory.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t("settings.deviceHistoryEmpty")}
          </p>
        ) : (
          sortedHistory.map((entry) => (
            <DeviceRow
              key={entry.address}
              entry={entry}
              isActive={
                activeKey !== null &&
                normalizeDeviceKey(entry.address) === activeKey
              }
              isPaired={pairedKeys.has(normalizeDeviceKey(entry.address))}
              onSelect={() => handleSelect(entry.address)}
              rightSlot={
                <Link
                  to="/settings/devices/$address"
                  params={{ address: encodeDeviceAddress(entry.address) }}
                  aria-label={t("settings.deviceDetails")}
                  className="bg-background border-bd-outline focus-visible:ring-offset-background flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-solid px-1.5 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <Pencil size={18} />
                </Link>
              }
            />
          ))
        )}
      </div>
    </PageFrame>
  );
}

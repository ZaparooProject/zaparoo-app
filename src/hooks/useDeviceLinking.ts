import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  CoreAPI,
  getDeviceAddress,
  isRequestCancelledError,
} from "@/lib/coreApi";
import { createDeviceClaim, NotSignedInError } from "@/lib/onlineApi";
import { logger } from "@/lib/logger";

const ZAPAROO_API_URL = "https://api.zaparoo.com";
const DEVICE_LINK_TIMEOUT_MS = 15_000;
const DEVICE_LINK_STATUS_STALE_MS = 30_000;

export type DeviceLinkState =
  | "unavailable"
  | "checking"
  | "unlinked"
  | "linking"
  | "linked";

export function useDeviceLinking(enabled: boolean) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const deviceAddress = getDeviceAddress();
  const statusQueryKey = useMemo(
    () => ["deviceLinkStatus", deviceAddress] as const,
    [deviceAddress],
  );
  const [linking, setLinking] = useState(false);
  const mountedRef = useRef(true);
  const linkControllerRef = useRef<AbortController | null>(null);
  const linkingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      linkControllerRef.current?.abort();
    };
  }, []);

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: async ({ signal }) => {
      try {
        return await CoreAPI.settingsAuthStatus(
          { url: ZAPAROO_API_URL },
          signal,
        );
      } catch (error) {
        if (isRequestCancelledError(error)) throw error;
        logger.error("Device link status check failed", error, {
          category: "api",
          action: "deviceLink.status",
          severity: "warning",
        });
        return { linked: false };
      }
    },
    enabled,
    staleTime: DEVICE_LINK_STATUS_STALE_MS,
    retry: false,
  });

  const state: DeviceLinkState = !enabled
    ? "unavailable"
    : linking
      ? "linking"
      : statusQuery.isPending
        ? "checking"
        : statusQuery.data?.linked
          ? "linked"
          : "unlinked";

  const linkDevice = useCallback(async () => {
    if (!enabled || linkingRef.current) return;

    linkingRef.current = true;
    setLinking(true);
    const controller = new AbortController();
    linkControllerRef.current = controller;
    let timedOut = false;
    let stage: "claim" | "core" = "claim";
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DEVICE_LINK_TIMEOUT_MS);

    try {
      const claim = await createDeviceClaim(controller.signal);
      stage = "core";
      await CoreAPI.settingsAuthClaim(
        { claimUrl: claim.claim_url, token: claim.token },
        controller.signal,
      );

      if (!mountedRef.current) return;
      queryClient.setQueryData(statusQueryKey, { linked: true });
      toast.success(t("online.deviceLink.success"));
    } catch (error) {
      if (!mountedRef.current) return;

      void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      logger.error("Device linking failed", error, {
        category: "api",
        action:
          stage === "claim" ? "deviceLink.createClaim" : "deviceLink.redeem",
        severity: "error",
      });

      if (timedOut || isRequestCancelledError(error)) {
        toast.error(t("online.deviceLink.timeout"));
      } else if (error instanceof NotSignedInError) {
        toast.error(t("online.notSignedInError"));
      } else if (axios.isAxiosError(error) && error.response?.status === 429) {
        toast.error(t("online.deviceLink.rateLimited"));
      } else if (stage === "claim") {
        toast.error(t("online.deviceLink.claimFailed"));
      } else {
        toast.error(t("online.deviceLink.linkFailed"));
      }
    } finally {
      clearTimeout(timeoutId);
      if (linkControllerRef.current === controller) {
        linkControllerRef.current = null;
      }
      linkingRef.current = false;
      if (mountedRef.current) setLinking(false);
    }
  }, [enabled, queryClient, statusQueryKey, t]);

  return { state, linkDevice };
}

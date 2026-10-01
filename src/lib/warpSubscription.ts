import type { SubscriptionResponse } from "@/lib/models";

// Only the onboarding promotion gets a local expiry cap. Other access still
// comes from the effective API snapshot, including separately owned lifetime Pro.
export function getTrialAccessContext(
  status: SubscriptionResponse,
  userID: string,
) {
  if (
    status.trial?.status !== "active" ||
    !status.trial.expires_at ||
    isPaidWarpActive(status) ||
    status.sources.some((source) => source !== "revenuecat")
  )
    return undefined;
  return { userID, expiresAt: status.trial.expires_at };
}

export function canSubscribeToWarp(
  status: SubscriptionResponse | null | undefined,
): boolean {
  return status?.can_subscribe ?? status?.is_premium === false;
}

export function getPaidWarpSubscription(
  status: SubscriptionResponse | null | undefined,
) {
  if (status?.paid_subscription !== undefined) return status.paid_subscription;
  const rc = status?.revenuecat;
  return rc?.active &&
    ["APP_STORE", "PLAY_STORE", "PADDLE", "STRIPE", "AMAZON"].includes(
      rc.store ?? "",
    ) &&
    !rc.product_id?.startsWith("rc_promo_")
    ? rc
    : null;
}

export function isPaidWarpActive(
  status: SubscriptionResponse | null | undefined,
): boolean {
  return getPaidWarpSubscription(status)?.active === true;
}

export function getWarpTrialView(
  status: SubscriptionResponse | null | undefined,
  now = Date.now(),
) {
  const trial = status?.trial;
  if (!trial) return null;
  const start = Date.parse(trial.starts_at ?? "");
  const end = Date.parse(trial.expires_at ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return {
      status: trial.status === "active" ? "pending" : trial.status,
      expiresAt: null,
      notice: null,
    };
  const remaining = end - now;
  const active = trial.status === "active" && remaining > 0;
  return {
    status:
      trial.status === "active" && remaining <= 0 ? "expired" : trial.status,
    expiresAt: trial.expires_at!,
    notice:
      active && remaining <= 24 * 60 * 60 * 1000
        ? ("last-day" as const)
        : active && remaining <= 72 * 60 * 60 * 1000
          ? ("ending" as const)
          : null,
  };
}

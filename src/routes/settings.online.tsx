import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { Browser } from "@capacitor/browser";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import {
  LogOutIcon,
  UserPlusIcon,
  ExternalLinkIcon,
  Trash2Icon,
} from "lucide-react";
import type { AxiosError } from "axios";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { WarpSubscription } from "@/components/WarpSubscription";
import { OnlineDeviceSetup } from "@/components/OnlineDeviceSetup";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useStatusStore } from "@/lib/store.ts";
import { PageFrame } from "@/components/PageFrame.tsx";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { BackIcon, GoogleIcon, AppleIcon } from "@/lib/images";
import { logger } from "@/lib/logger";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import {
  collectErrorSearchStrings,
  isExpectedEmailAuthError,
  isExpectedRevenueCatLogoutError,
} from "@/lib/errors";
import {
  updateRequirements,
  deleteAccount,
  cancelAccountDeletion,
  NotSignedInError,
} from "@/lib/onlineApi";
import {
  MfaAuthentication,
  type MfaSignInResult,
} from "@/lib/mfaAuthentication";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPurchasePreviewState,
  usePurchasePreviewStore,
} from "@/lib/purchasePreviewStore";
import { usePreferencesStore } from "@/lib/preferencesStore";

export const Route = createFileRoute("/settings/online")({
  component: OnlinePage,
});

/**
 * Check if OAuth (Google/Apple Sign-In) should be available.
 * OAuth is available on native platforms or when hosted on https://zaparoo.app
 */
function isOAuthAvailable(): boolean {
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  // On web, only allow OAuth on the official zaparoo.app domain
  return window.location.hostname === "zaparoo.app";
}

const SIGNUP_EMAIL_AUTH_ERROR_TOKENS = [
  "email-already-in-use",
  "auth/email-already-in-use",
  "weak-password",
  "auth/weak-password",
] as const;

const INVALID_MFA_CODE_TOKENS = [
  "invalid-verification-code",
  "auth/invalid-verification-code",
] as const;

const EXPIRED_MFA_CHALLENGE_TOKENS = [
  "code-expired",
  "session-expired",
  "invalid-multi-factor-session",
  "multi-factor-challenge-missing",
  "totp-challenge-timeout",
] as const;

function getExpectedSignupEmailAuthErrorToken(error: unknown): string | null {
  if (!isExpectedEmailAuthError(error)) return null;

  const searchStrings = collectErrorSearchStrings(error);
  return (
    SIGNUP_EMAIL_AUTH_ERROR_TOKENS.find((token) =>
      searchStrings.some((searchString) => searchString.includes(token)),
    ) ?? null
  );
}

/**
 * Get the primary auth provider from user data
 * Returns 'google', 'apple', 'password', or null
 */
type AuthProvider = "google" | "apple" | "password";

function getSoleLinkedAuthProvider(
  providerData: { providerId: string }[] | undefined,
): AuthProvider | null {
  const providers = new Set<AuthProvider>();
  for (const provider of providerData ?? []) {
    if (provider.providerId === "google.com") providers.add("google");
    if (provider.providerId === "apple.com") providers.add("apple");
    if (provider.providerId === "password") providers.add("password");
  }

  return providers.size === 1
    ? (providers.values().next().value ?? null)
    : null;
}

function hasPasswordProvider(
  providerData: { providerId: string }[] | undefined,
): boolean {
  return (
    providerData?.some(({ providerId }) => providerId === "password") ?? false
  );
}

export function OnlinePage() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("online.title"));
  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const connected = useStatusStore((state) => state.connected);
  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);
  const [onlineEmail, setOnlineEmail] = useState("");
  const [onlinePassword, setOnlinePassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const [pendingAuthProvider, setPendingAuthProvider] =
    useState<AuthProvider | null>(null);
  const [sessionAuthProvider, setSessionAuthProvider] =
    useState<AuthProvider | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [isMfaVerifying, setIsMfaVerifying] = useState(false);
  const mfaHeadingRef = useRef<HTMLHeadingElement>(null);
  const mfaPendingRef = useRef(mfaPending);
  const isMfaCodeComplete = /^\d{6}$/.test(mfaCode);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [scheduledDeletion, setScheduledDeletion] = useState<string | null>(
    null,
  );
  const [isCancelling, setIsCancelling] = useState(false);

  const oauthAvailable = isOAuthAvailable();
  const configuredPurchasePreview = usePurchasePreviewStore(
    (state) => state.state,
  );
  const purchasePreview = getPurchasePreviewState(configuredPurchasePreview);
  const onlinePremiumAccess = usePreferencesStore(
    (state) => state.onlinePremiumAccess,
  );
  const displayedWarpActive =
    purchasePreview === "live"
      ? onlinePremiumAccess
      : purchasePreview === "warp";

  useEffect(() => {
    mfaPendingRef.current = mfaPending;
    if (mfaPending) {
      mfaHeadingRef.current?.focus();
    }
  }, [mfaPending]);

  useEffect(
    () => () => {
      if (!mfaPendingRef.current) return;

      void MfaAuthentication.cancelSignIn().catch((e) => {
        logger.error("Failed to clear MFA challenge:", e, {
          category: "api",
          action: "cancelMfaSignIn",
          severity: "warning",
        });
      });
    },
    [],
  );

  const completeSignIn = async (): Promise<boolean> => {
    const { user } = await FirebaseAuthentication.getCurrentUser();
    if (!user) {
      toast.error(t("online.loginFail"));
      return false;
    }

    try {
      await updateRequirements({
        accept_tos: true,
        accept_privacy: true,
      });
    } catch (e) {
      logger.error("Failed to record terms acceptance:", e, {
        category: "api",
        action: "updateRequirements",
        severity: "warning",
      });
    }

    setLoggedInUser(user);
    return true;
  };

  const handleFirstFactorResult = async (
    result: MfaSignInResult,
    provider: AuthProvider,
  ) => {
    if (result.mfaRequired) {
      setPendingAuthProvider(provider);
      setMfaPending(true);
      setMfaCode("");
      setMfaError(null);
      return;
    }

    if (await completeSignIn()) setSessionAuthProvider(provider);
  };

  const handleEmailAuth = async () => {
    if (!onlineEmail || !onlinePassword) return;

    // Require age confirmation for signup
    if (isSignUpMode && !ageConfirmed) {
      setFormError(t("online.ageConfirmRequired"));
      return;
    }

    setFormError(null);

    setIsLoading(true);

    if (isSignUpMode) {
      // Sign up flow
      try {
        const result =
          await FirebaseAuthentication.createUserWithEmailAndPassword({
            email: onlineEmail,
            password: onlinePassword,
          });

        if (result.user) {
          // Auto-agree to requirements on signup (includes age verification)
          try {
            await updateRequirements({
              accept_tos: true,
              accept_privacy: true,
              age_verified: true,
            });
          } catch (e) {
            logger.error("Failed to record terms acceptance:", e, {
              category: "api",
              action: "updateRequirements",
              severity: "warning",
            });
            // Continue anyway - modal will show if needed
          }

          setLoggedInUser(result.user);
          setSessionAuthProvider("password");
        } else {
          toast.error(t("online.signUpFail"));
        }
      } catch (e) {
        const isExpectedEmailError = isExpectedEmailAuthError(e);
        const emailAuthErrorToken = getExpectedSignupEmailAuthErrorToken(e);
        if (!isExpectedEmailError) {
          logger.error("Firebase email signup failed:", e, {
            category: "api",
            action: "createUserWithEmailAndPassword",
            severity: "warning",
          });
        }

        if (emailAuthErrorToken?.includes("email-already-in-use")) {
          toast.error(t("online.emailExists"));
        } else if (emailAuthErrorToken?.includes("weak-password")) {
          toast.error(t("online.weakPassword"));
        } else {
          toast.error(t("online.signUpFail"));
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Log in flow
      try {
        const result = await MfaAuthentication.signInWithEmailAndPassword({
          email: onlineEmail,
          password: onlinePassword,
        });
        setOnlinePassword("");

        await handleFirstFactorResult(result, "password");
      } catch (e) {
        const error = e as Error;
        if (!isExpectedEmailAuthError(e)) {
          logger.error("Firebase email login failed:", error, {
            category: "api",
            action: "signInWithEmail",
            severity: "warning",
          });
        }
        toast.error(t("online.loginWrong"));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancelMfa = async () => {
    try {
      await MfaAuthentication.cancelSignIn();
    } catch (e) {
      logger.error("Failed to cancel MFA challenge:", e, {
        category: "api",
        action: "cancelMfaSignIn",
        severity: "warning",
      });
    }
    setMfaPending(false);
    setPendingAuthProvider(null);
    setMfaCode("");
    setMfaError(null);
  };

  const handleMfaVerify = async () => {
    if (isMfaVerifying) return;

    if (!isMfaCodeComplete) {
      setMfaError(t("online.mfaCodeInvalid"));
      return;
    }

    setIsMfaVerifying(true);
    setMfaError(null);
    try {
      await MfaAuthentication.resolveTotpSignIn({ code: mfaCode });
      const signedIn = await completeSignIn();
      if (signedIn && pendingAuthProvider) {
        setSessionAuthProvider(pendingAuthProvider);
      }
      setMfaPending(false);
      setPendingAuthProvider(null);
      setMfaCode("");
    } catch (e) {
      const searchStrings = collectErrorSearchStrings(e);
      const hasToken = (tokens: readonly string[]) =>
        tokens.some((token) =>
          searchStrings.some((searchString) => searchString.includes(token)),
        );

      if (hasToken(INVALID_MFA_CODE_TOKENS)) {
        setMfaError(t("online.mfaCodeInvalid"));
      } else if (hasToken(EXPIRED_MFA_CHALLENGE_TOKENS)) {
        await handleCancelMfa();
        toast.error(t("online.mfaExpired"));
      } else {
        logger.error("Firebase MFA verification failed:", e, {
          category: "api",
          action: "resolveTotpSignIn",
          severity: "warning",
        });
        setMfaError(t("online.mfaFailed"));
      }
    } finally {
      setIsMfaVerifying(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await MfaAuthentication.signInWithGoogle();
      await handleFirstFactorResult(result, "google");
    } catch (e) {
      const error = e as Error;
      // Check if user cancelled the login - don't show error toast
      const msg = error.message.toLowerCase();
      if (
        msg.includes("cancel") ||
        msg.includes("popup_closed") ||
        msg.includes("user_denied") ||
        msg.includes("dismissed")
      ) {
        return;
      }
      logger.error("Firebase Google login failed:", error, {
        category: "api",
        action: "signInWithGoogle",
        severity: "warning",
      });
      toast.error(t("online.loginFail"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await MfaAuthentication.signInWithApple();
      await handleFirstFactorResult(result, "apple");
    } catch (e) {
      const error = e as Error;
      // Check if user cancelled the login - don't show error toast
      const msg = error.message.toLowerCase();
      if (
        msg.includes("cancel") ||
        msg.includes("popup_closed") ||
        msg.includes("user_denied") ||
        msg.includes("dismissed")
      ) {
        return;
      }
      logger.error("Firebase Apple login failed:", error, {
        category: "api",
        action: "signInWithApple",
        severity: "warning",
      });
      toast.error(t("online.loginFail"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (!onlineEmail) {
      setFormError(t("online.enterEmailFirst"));
      return;
    }

    setFormError(null);
    FirebaseAuthentication.sendPasswordResetEmail({
      email: onlineEmail,
    })
      .then(() => {
        toast.success(t("online.resetEmailSent"));
      })
      .catch((e: Error) => {
        logger.error("Firebase password reset failed:", e, {
          category: "api",
          action: "sendPasswordResetEmail",
          severity: "warning",
        });
        toast.error(t("online.resetEmailFailed"));
      });
  };

  const handleSignOut = async () => {
    // Revert RevenueCat to anonymous before Firebase signOut (skip on web)
    if (Capacitor.getPlatform() !== "web") {
      try {
        const { isAnonymous } = await Purchases.isAnonymous();
        if (!isAnonymous) {
          await Purchases.logOut();
        }
      } catch (e) {
        if (!isExpectedRevenueCatLogoutError(e)) {
          logger.error("RevenueCat logout failed:", e, {
            category: "purchase",
            action: "logOut",
            severity: "warning",
          });
        }
      }
    }

    FirebaseAuthentication.signOut()
      .then(() => {
        setLoggedInUser(null);
        setSessionAuthProvider(null);
        setOnlineEmail("");
        setOnlinePassword("");
      })
      .catch((e) => {
        logger.error("Firebase sign out failed:", e, {
          category: "api",
          action: "signOut",
          severity: "warning",
        });
      });
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onlineEmail && onlinePassword && !isLoading) {
      handleEmailAuth();
    }
  };

  const handleMfaKeyUp = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && isMfaCodeComplete && !isMfaVerifying) {
      handleMfaVerify();
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAccount(confirmText);
      setScheduledDeletion(result.scheduled_deletion_at);
      setDeleteModalOpen(false);
      setConfirmText("");
      toast.success(t("online.deleteAccountScheduled"));
    } catch (e) {
      if (e instanceof NotSignedInError) {
        setDeleteModalOpen(false);
        setConfirmText("");
        toast.error(t("online.notSignedInError"));
        return;
      }
      const error = e as AxiosError<{ error?: { code?: string } }>;
      const code = error.response?.data?.error?.code;

      if (code === "confirmation_mismatch") {
        toast.error(t("online.deleteConfirmationMismatch"));
      } else if (code === "developer_has_active_media") {
        toast.error(t("online.deleteHasActiveMedia"));
      } else if (code === "deletion_already_scheduled") {
        toast.error(t("online.deletionAlreadyScheduled"));
      } else {
        logger.error("Account deletion failed:", e, {
          category: "api",
          action: "deleteAccount",
          severity: "error",
        });
        toast.error(t("online.deleteAccountFailed"));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    setIsCancelling(true);
    try {
      await cancelAccountDeletion();
      setScheduledDeletion(null);
      toast.success(t("online.deletionCancelled"));
    } catch (e) {
      if (e instanceof NotSignedInError) {
        toast.error(t("online.notSignedInError"));
        return;
      }
      logger.error("Cancel deletion failed:", e, {
        category: "api",
        action: "cancelAccountDeletion",
        severity: "error",
      });
      toast.error(t("online.cancelDeletionFailed"));
    } finally {
      setIsCancelling(false);
    }
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
        <h1 className="text-foreground text-xl">{t("online.title")}</h1>
      }
    >
      <div className="flex flex-col gap-4">
        {loggedInUser !== null ? (
          // Logged in state
          <div className="flex flex-col gap-6 py-4">
            <div className="flex flex-col items-center gap-1">
              {loggedInUser.displayName && (
                <span className="text-lg font-medium text-white">
                  {loggedInUser.displayName}
                </span>
              )}
              <span className="text-muted-foreground text-sm">
                {loggedInUser.email}
              </span>

              {/* Auth provider indicator */}
              {(() => {
                const provider =
                  sessionAuthProvider ??
                  getSoleLinkedAuthProvider(loggedInUser.providerData);
                if (provider === "google") {
                  return (
                    <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                      <GoogleIcon size="14" />
                      {t("online.loggedInWithGoogle")}
                    </span>
                  );
                }
                if (provider === "apple") {
                  return (
                    <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                      <AppleIcon size="14" />
                      {t("online.loggedInWithApple")}
                    </span>
                  );
                }
                if (provider === "password") {
                  return (
                    <span className="text-muted-foreground mt-1 text-xs">
                      {t("online.loggedInWithPassword")}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            <OnlineDeviceSetup
              connected={connected}
              warpActive={displayedWarpActive}
            />

            {(Capacitor.isNativePlatform() || purchasePreview !== "live") && (
              <WarpSubscription appUserID={loggedInUser.uid} />
            )}

            {/* Account actions */}
            <section
              className="flex w-full flex-col gap-3"
              aria-labelledby="online-account-actions-title"
            >
              <h2
                id="online-account-actions-title"
                className="text-lg font-medium text-white"
              >
                {t("online.account")}
              </h2>

              {/* Dashboard button */}
              <Button
                label={t("online.dashboard")}
                variant="outline"
                icon={<ExternalLinkIcon size="20" />}
                onClick={() =>
                  Browser.open({ url: "https://online.zaparoo.com" })
                }
                className="w-full"
              />

              {/* Change password - only for email/password users */}
              {hasPasswordProvider(loggedInUser.providerData) && (
                <Button
                  label={t("online.changePassword")}
                  variant="outline"
                  onClick={() => {
                    if (loggedInUser.email) {
                      FirebaseAuthentication.sendPasswordResetEmail({
                        email: loggedInUser.email,
                      })
                        .then(() => {
                          toast.success(t("online.resetEmailSent"));
                        })
                        .catch((e: Error) => {
                          logger.error("Firebase password reset failed:", e, {
                            category: "api",
                            action: "sendPasswordResetEmail",
                            severity: "warning",
                          });
                          toast.error(t("online.resetEmailFailed"));
                        });
                    }
                  }}
                  className="w-full"
                />
              )}

              {/* Log out button */}
              <Button
                label={t("online.logout")}
                variant="outline"
                icon={<LogOutIcon size="20" />}
                onClick={handleSignOut}
                className="w-full"
              />

              {/* Delete account section */}
              {scheduledDeletion ? (
                <div className="border-error/30 bg-error/10 mt-2 rounded-lg border p-3">
                  <p className="text-error text-sm font-medium">
                    {t("online.deletionScheduledTitle")}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("online.deletionScheduledMessage", {
                      date: new Date(scheduledDeletion).toLocaleDateString(),
                    })}
                  </p>
                  <Button
                    label={
                      isCancelling
                        ? t("spinner.cancelling")
                        : t("online.cancelDeletion")
                    }
                    variant="outline"
                    onClick={handleCancelDeletion}
                    disabled={isCancelling}
                    className="mt-3 w-full"
                  />
                </div>
              ) : (
                <Button
                  label={t("online.deleteAccount")}
                  variant="outline"
                  icon={<Trash2Icon size="20" />}
                  onClick={() => setDeleteModalOpen(true)}
                  className="border-error text-error mt-2 w-full"
                />
              )}
            </section>
          </div>
        ) : mfaPending ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <h2
                ref={mfaHeadingRef}
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                {t("online.mfaTitle")}
              </h2>
              <p className="text-muted-foreground text-center text-sm">
                {t("online.mfaDescription")}
              </p>
            </div>

            <TextInput
              label={t("online.mfaCode")}
              placeholder="123456"
              value={mfaCode}
              setValue={(value) =>
                setMfaCode(value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              onKeyUp={handleMfaKeyUp}
              disabled={isMfaVerifying}
              error={mfaError ?? undefined}
            />

            <Button
              label={
                isMfaVerifying
                  ? t("online.mfaVerifying")
                  : t("online.mfaVerify")
              }
              onClick={handleMfaVerify}
              disabled={!isMfaCodeComplete || isMfaVerifying}
              className="w-full"
              intent="primary"
            />

            <button
              type="button"
              onClick={handleCancelMfa}
              disabled={isMfaVerifying}
              className="text-muted-foreground hover:text-foreground text-sm underline transition-colors disabled:opacity-50"
            >
              {t("online.mfaBack")}
            </button>
          </div>
        ) : (
          // Not logged in state
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-center text-sm">
              {t("online.description")}
            </p>

            {/* Email input */}
            <TextInput
              label={t("online.email")}
              placeholder="me@example.com"
              value={onlineEmail}
              setValue={setOnlineEmail}
              type="email"
              autoComplete="email"
              onKeyUp={handleKeyUp}
            />

            {/* Password input */}
            <div className="flex flex-col gap-1">
              <TextInput
                label={t("online.password")}
                placeholder=""
                type="password"
                value={onlinePassword}
                setValue={setOnlinePassword}
                autoComplete={
                  isSignUpMode ? "new-password" : "current-password"
                }
                onKeyUp={handleKeyUp}
              />

              {/* Forgot password - right aligned, only in log in mode */}
              {!isSignUpMode && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {t("online.forgotPassword")}
                  </button>
                </div>
              )}
            </div>

            {/* Age confirmation - only in sign up mode */}
            {isSignUpMode && (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="age-confirm"
                  checked={ageConfirmed}
                  onCheckedChange={(checked) => {
                    setAgeConfirmed(checked === true);
                    if (checked === true) setFormError(null);
                  }}
                />
                <Label
                  htmlFor="age-confirm"
                  className="text-sm leading-tight text-white"
                >
                  {t("online.ageConfirmLabel")}
                </Label>
              </div>
            )}

            {/* Inline form error */}
            {formError && <p className="text-sm text-red-400">{formError}</p>}

            {/* Log in / Sign up Button */}
            <Button
              label={isSignUpMode ? t("online.signUp") : t("online.login")}
              icon={isSignUpMode ? <UserPlusIcon size="20" /> : undefined}
              onClick={handleEmailAuth}
              disabled={
                !onlineEmail ||
                !onlinePassword ||
                isLoading ||
                (isSignUpMode && !ageConfirmed)
              }
              className="w-full"
              intent="primary"
            />

            {/* Toggle between Log in and Sign up */}
            <p className="text-muted-foreground text-center text-sm">
              {isSignUpMode
                ? t("online.switchToLogInPrefix")
                : t("online.switchToSignUpPrefix")}
              <button
                type="button"
                onClick={() => {
                  setIsSignUpMode(!isSignUpMode);
                  setAgeConfirmed(false);
                  setFormError(null);
                }}
                className="text-white underline transition-colors hover:text-white/80"
              >
                {isSignUpMode
                  ? t("online.switchToLogInLink")
                  : t("online.switchToSignUpLink")}
              </button>
            </p>

            {/* OAuth section - only show on native or zaparoo.app */}
            {oauthAvailable && (
              <>
                <div className="my-1 flex items-center gap-3">
                  <div className="bg-border h-px flex-1" />
                  <span className="text-muted-foreground text-sm">or</span>
                  <div className="bg-border h-px flex-1" />
                </div>

                {/* On iOS, show Apple first. On Android/other, show Google first */}
                {Capacitor.getPlatform() === "ios" ? (
                  <>
                    <Button
                      label={t("online.loginApple")}
                      variant="outline"
                      icon={<AppleIcon size="20" />}
                      onClick={handleAppleSignIn}
                      disabled={isLoading}
                      className="w-full"
                    />
                    <Button
                      label={t("online.loginGoogle")}
                      variant="outline"
                      icon={<GoogleIcon size="20" />}
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="w-full"
                    />
                  </>
                ) : (
                  <>
                    <Button
                      label={t("online.loginGoogle")}
                      variant="outline"
                      icon={<GoogleIcon size="20" />}
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="w-full"
                    />
                    <Button
                      label={t("online.loginApple")}
                      variant="outline"
                      icon={<AppleIcon size="20" />}
                      onClick={handleAppleSignIn}
                      disabled={isLoading}
                      className="w-full"
                    />
                  </>
                )}
              </>
            )}

            {/* TOS/Privacy agreement */}
            <p className="text-muted-foreground text-center text-xs">
              {isSignUpMode
                ? t("online.agreementSignUp")
                : t("online.agreementLogin")}{" "}
              <a
                href="https://zaparoo.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t("online.termsOfService")}
              </a>{" "}
              {t("online.and")}{" "}
              <a
                href="https://zaparoo.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t("online.privacyPolicy")}
              </a>
              .
            </p>
          </div>
        )}
      </div>

      {/* Delete account confirmation modal */}
      <Dialog
        open={deleteModalOpen}
        onOpenChange={(open) => {
          setDeleteModalOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <DialogContent
          onOpenChange={(open) => {
            setDeleteModalOpen(open);
            if (!open) setConfirmText("");
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("online.deleteAccountConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {t("online.deleteAccountConfirmMessage")}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("online.deleteAccountGracePeriod")}
            </p>
            <div>
              <label className="text-sm text-white">
                {t("online.deleteConfirmLabel")}
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="border-bd-input bg-background text-foreground mt-1 w-full rounded-md border p-3"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                label={t("nav.cancel")}
                onClick={() => {
                  setDeleteModalOpen(false);
                  setConfirmText("");
                }}
                className="flex-1"
                disabled={isDeleting}
              />
              <Button
                variant="outline"
                intent="destructive"
                label={
                  isDeleting ? t("spinner.deleting") : t("online.deleteAccount")
                }
                onClick={handleDeleteAccount}
                className="border-error text-error flex-1"
                disabled={isDeleting || confirmText !== "DELETE MY ACCOUNT"}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

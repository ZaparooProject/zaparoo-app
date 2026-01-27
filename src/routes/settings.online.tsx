import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState, type KeyboardEvent } from "react";
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
  CheckCircleIcon,
  AlertCircleIcon,
} from "lucide-react";
import type { AxiosError } from "axios";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { Button } from "@/components/wui/Button.tsx";
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
  updateRequirements,
  deleteAccount,
  cancelAccountDeletion,
} from "@/lib/onlineApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

/**
 * Get user's display initial for avatar
 */
function getUserInitial(
  displayName: string | null,
  email: string | null,
): string {
  if (displayName && displayName.length > 0) {
    return displayName.charAt(0).toUpperCase();
  }
  if (email && email.length > 0) {
    return email.charAt(0).toUpperCase();
  }
  return "?";
}

/**
 * Get the primary auth provider from user data
 * Returns 'google', 'apple', 'password', or null
 */
function getAuthProvider(
  providerData: { providerId: string }[] | undefined,
): "google" | "apple" | "password" | null {
  if (!providerData || providerData.length === 0) return null;

  // Check provider IDs - prioritize OAuth providers over password
  for (const provider of providerData) {
    if (provider.providerId === "google.com") return "google";
    if (provider.providerId === "apple.com") return "apple";
  }

  // Check for password provider
  for (const provider of providerData) {
    if (provider.providerId === "password") return "password";
  }

  return null;
}

function OnlinePage() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("online.title"));
  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);
  const [onlineEmail, setOnlineEmail] = useState("");
  const [onlinePassword, setOnlinePassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
        } else {
          toast.error(t("online.signUpFail"));
        }
      } catch (e) {
        const error = e as Error;
        logger.error("Firebase email signup failed:", error, {
          category: "api",
          action: "createUserWithEmailAndPassword",
          severity: "warning",
        });

        // Handle specific error codes
        if (error.message.includes("email-already-in-use")) {
          toast.error(t("online.emailExists"));
        } else if (error.message.includes("weak-password")) {
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
        const result = await FirebaseAuthentication.signInWithEmailAndPassword({
          email: onlineEmail,
          password: onlinePassword,
        });

        if (result.user) {
          // Auto-agree to TOS/Privacy on login (no age verification for existing users)
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
            // Continue anyway - modal will show if needed
          }

          setLoggedInUser(result.user);
        } else {
          toast.error(t("online.loginWrong"));
        }
      } catch (e) {
        const error = e as Error;
        logger.error("Firebase email login failed:", error, {
          category: "api",
          action: "signInWithEmail",
          severity: "warning",
        });
        toast.error(t("online.loginWrong"));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await FirebaseAuthentication.signInWithGoogle();

      if (result.user) {
        // Auto-agree to TOS/Privacy on OAuth login
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
          // Continue anyway - modal will show if needed
        }

        setLoggedInUser(result.user);
      } else {
        toast.error(t("online.loginWrong"));
      }
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
      const result = await FirebaseAuthentication.signInWithApple();

      if (result.user) {
        // Auto-agree to TOS/Privacy on OAuth login
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
          // Continue anyway - modal will show if needed
        }

        setLoggedInUser(result.user);
      } else {
        toast.error(t("online.loginWrong"));
      }
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
        await Purchases.logOut();
      } catch (e) {
        logger.error("RevenueCat logout failed:", e, {
          category: "purchase",
          action: "logOut",
          severity: "warning",
        });
      }
    }

    FirebaseAuthentication.signOut()
      .then(() => {
        setLoggedInUser(null);
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

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAccount(confirmText);
      setScheduledDeletion(result.scheduled_deletion_at);
      setDeleteModalOpen(false);
      setConfirmText("");
      toast.success(t("online.deleteAccountScheduled"));
    } catch (e) {
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

  const handleResendVerification = async () => {
    try {
      await FirebaseAuthentication.sendEmailVerification();
      toast.success(t("online.verificationSent"));
    } catch (e) {
      logger.error("Failed to send verification email:", e, {
        category: "api",
        action: "sendEmailVerification",
        severity: "warning",
      });
      toast.error(t("online.verificationFailed"));
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
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Avatar - use profile photo if available, otherwise initial */}
            {loggedInUser.photoUrl ? (
              <img
                src={loggedInUser.photoUrl}
                alt=""
                className="border-bd-filled h-20 w-20 rounded-full border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="bg-button-pattern border-bd-filled flex h-20 w-20 items-center justify-center rounded-full border text-3xl font-semibold text-white">
                {getUserInitial(loggedInUser.displayName, loggedInUser.email)}
              </div>
            )}

            {/* User info */}
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
                const provider = getAuthProvider(loggedInUser.providerData);
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
                return null;
              })()}

              {/* Email verification indicator - only for email/password users */}
              {getAuthProvider(loggedInUser.providerData) === "password" &&
                (loggedInUser.emailVerified ? (
                  <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                    <CheckCircleIcon size="14" className="text-success" />
                    {t("online.emailVerified")}
                  </span>
                ) : (
                  <div className="mt-1 flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1 text-xs text-amber-500">
                      <AlertCircleIcon size="14" />
                      {t("online.emailNotVerified")}
                    </span>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      {t("online.resendVerification")}
                    </button>
                  </div>
                ))}
            </div>

            {/* Account actions */}
            <div className="mt-2 flex w-full flex-col gap-3">
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
              {getAuthProvider(loggedInUser.providerData) === "password" && (
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
            </div>
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

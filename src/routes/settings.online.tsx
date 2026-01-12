import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState, type KeyboardEvent } from "react";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { LogOutIcon, UserPlusIcon } from "lucide-react";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { useStatusStore } from "@/lib/store.ts";
import { PageFrame } from "@/components/PageFrame.tsx";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { BackIcon, GoogleIcon, AppleIcon } from "@/lib/images";
import { logger } from "@/lib/logger";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

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

  const oauthAvailable = isOAuthAvailable();

  const handleEmailAuth = () => {
    if (!onlineEmail || !onlinePassword) return;

    setIsLoading(true);

    if (isSignUpMode) {
      // Sign up flow
      FirebaseAuthentication.createUserWithEmailAndPassword({
        email: onlineEmail,
        password: onlinePassword,
      })
        .then((result) => {
          if (result.user) {
            toast.success(t("online.signUpSuccess"));
            setLoggedInUser(result.user);
          } else {
            toast.error(t("online.signUpFail"));
          }
          setIsLoading(false);
        })
        .catch((e: Error) => {
          logger.error("Firebase email signup failed:", e, {
            category: "api",
            action: "createUserWithEmailAndPassword",
            severity: "warning",
          });

          // Handle specific error codes
          if (e.message.includes("email-already-in-use")) {
            toast.error(t("online.emailExists"));
          } else if (e.message.includes("weak-password")) {
            toast.error(t("online.weakPassword"));
          } else {
            toast.error(t("online.signUpFail"));
          }
          setIsLoading(false);
        });
    } else {
      // Log in flow
      FirebaseAuthentication.signInWithEmailAndPassword({
        email: onlineEmail,
        password: onlinePassword,
      })
        .then((result) => {
          if (result.user) {
            toast.success(t("online.loginSuccess"));
            setLoggedInUser(result.user);
          } else {
            toast.error(t("online.loginWrong"));
          }
          setIsLoading(false);
        })
        .catch((e: Error) => {
          logger.error("Firebase email login failed:", e, {
            category: "api",
            action: "signInWithEmail",
            severity: "warning",
          });
          toast.error(t("online.loginWrong"));
          setIsLoading(false);
        });
    }
  };

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    FirebaseAuthentication.signInWithGoogle()
      .then((result) => {
        if (result.user) {
          toast.success(t("online.loginSuccess"));
          setLoggedInUser(result.user);
        } else {
          toast.error(t("online.loginWrong"));
        }
        setIsLoading(false);
      })
      .catch((e: Error) => {
        logger.error("Firebase Google login failed:", e, {
          category: "api",
          action: "signInWithGoogle",
          severity: "warning",
        });
        toast.error(t("online.loginFail"));
        setIsLoading(false);
      });
  };

  const handleAppleSignIn = () => {
    setIsLoading(true);
    FirebaseAuthentication.signInWithApple()
      .then((result) => {
        if (result.user) {
          toast.success(t("online.loginSuccess"));
          setLoggedInUser(result.user);
        } else {
          toast.error(t("online.loginWrong"));
        }
        setIsLoading(false);
      })
      .catch((e: Error) => {
        logger.error("Firebase Apple login failed:", e, {
          category: "api",
          action: "signInWithApple",
          severity: "warning",
        });
        toast.error(t("online.loginFail"));
        setIsLoading(false);
      });
  };

  const handleForgotPassword = () => {
    if (!onlineEmail) {
      toast.error(t("online.enterEmailFirst"));
      return;
    }

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

  const handleSignOut = () => {
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
            {/* Avatar */}
            <div className="bg-button-pattern border-bd-filled flex h-20 w-20 items-center justify-center rounded-full border text-3xl font-semibold text-white">
              {getUserInitial(loggedInUser.displayName, loggedInUser.email)}
            </div>

            {/* User info */}
            <div className="flex flex-col items-center gap-1">
              {loggedInUser.displayName && (
                <span className="text-lg font-medium text-white">
                  {loggedInUser.displayName}
                </span>
              )}
              <span className="text-muted-foreground text-sm">
                {t("online.loggedInAs", { email: loggedInUser.email })}
              </span>
            </div>

            {/* Log out button */}
            <Button
              label={t("online.logout")}
              variant="outline"
              icon={<LogOutIcon size="20" />}
              onClick={handleSignOut}
              className="mt-2 w-full"
            />
          </div>
        ) : (
          // Not logged in state
          <div className="flex flex-col gap-4">
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

            {/* Log in / Sign up Button */}
            <Button
              label={isSignUpMode ? t("online.signUp") : t("online.login")}
              icon={isSignUpMode ? <UserPlusIcon size="20" /> : undefined}
              onClick={handleEmailAuth}
              disabled={!onlineEmail || !onlinePassword || isLoading}
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
                onClick={() => setIsSignUpMode(!isSignUpMode)}
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
          </div>
        )}
      </div>
    </PageFrame>
  );
}

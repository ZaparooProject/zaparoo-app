import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { LogOutIcon, ExternalLinkIcon, MailIcon } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/wui/Button";
import { useRequirementsStore } from "@/hooks/useRequirementsModal";
import { updateRequirements, getRequirements } from "@/lib/onlineApi";
import { useStatusStore } from "@/lib/store";
import { logger } from "@/lib/logger";

const TOS_URL = "https://zaparoo.com/terms";
const PRIVACY_URL = "https://zaparoo.com/privacy";

export function RequirementsModal() {
  const { t } = useTranslation();
  const { isOpen, pendingRequirements, close } = useRequirementsStore();
  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);

  // Local checkbox state - NOT live updating
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);

  // Email verification state
  const [emailSent, setEmailSent] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Inline status message
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Determine which requirements are needed
  const needsTos = pendingRequirements.some(
    (r) => r.type === "terms_acceptance",
  );
  const needsAge = pendingRequirements.some((r) => r.type === "age_verified");
  const needsEmailVerification = pendingRequirements.some(
    (r) => r.type === "email_verified",
  );

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTosChecked(false);
      setPrivacyChecked(false);
      setAgeChecked(false);
      setEmailSent(false);
      setEmailVerifying(false);
      setStatusMessage(null);
    }
  }, [isOpen]);

  // Check if Save button should be enabled
  const canSave =
    (!needsTos || (tosChecked && privacyChecked)) && (!needsAge || ageChecked);

  // Check if there are checkbox-based requirements (not just email)
  const hasCheckboxRequirements = needsTos || needsAge;

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await updateRequirements({
        accept_tos: tosChecked,
        accept_privacy: privacyChecked,
        age_verified: ageChecked,
      });

      // If email verification is still needed, don't close yet
      if (needsEmailVerification) {
        // Requirements updated, but modal stays open for email verification
        setStatusMessage({ type: "success", text: t("requirements.saved") });
      } else {
        // All requirements met, close modal
        close();
        toast.success(t("requirements.verified"));
      }
    } catch (e) {
      logger.error("Failed to update requirements:", e, {
        category: "api",
        action: "updateRequirements",
        severity: "error",
      });
      setStatusMessage({
        type: "error",
        text: t("error", { msg: "Failed to save" }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);

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

    try {
      await FirebaseAuthentication.signOut();
      setLoggedInUser(null);
      close();
    } catch (e) {
      logger.error("Firebase sign out failed:", e, {
        category: "api",
        action: "signOut",
        severity: "warning",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    setStatusMessage(null);
    try {
      await FirebaseAuthentication.sendEmailVerification();
      setEmailSent(true);
      setStatusMessage({ type: "success", text: t("requirements.emailSent") });
    } catch (e) {
      logger.error("Failed to send verification email:", e, {
        category: "api",
        action: "sendEmailVerification",
        severity: "error",
      });
      setStatusMessage({
        type: "error",
        text: t("requirements.emailSendFailed"),
      });
    }
  };

  const handleCheckEmailVerified = useCallback(async () => {
    setEmailVerifying(true);
    setStatusMessage(null);
    try {
      // Reload user to get latest verification status
      await FirebaseAuthentication.reload();
      const result = await FirebaseAuthentication.getCurrentUser();

      if (result.user?.emailVerified) {
        // Re-check requirements - if all pending ones are now met, modal will close
        const response = await getRequirements();
        const req = response.requirements;

        // Check if all originally pending requirements are now satisfied
        const allPendingMet = pendingRequirements.every((r) => {
          switch (r.type) {
            case "email_verified":
              return req.email_verified;
            case "terms_acceptance":
              return req.tos_accepted && req.privacy_accepted;
            case "age_verified":
              return req.age_verified;
            default:
              return true;
          }
        });

        if (allPendingMet) {
          close();
          toast.success(t("requirements.verified"));
        } else {
          // Update local user state
          setLoggedInUser(result.user);
          setStatusMessage({
            type: "success",
            text: t("requirements.emailVerified"),
          });
        }
      } else {
        setStatusMessage({
          type: "error",
          text: t("requirements.emailNotVerified"),
        });
      }
    } catch (e) {
      logger.error("Failed to check email verification:", e, {
        category: "api",
        action: "checkEmailVerified",
        severity: "error",
      });
      setStatusMessage({
        type: "error",
        text: t("requirements.emailCheckFailed"),
      });
    } finally {
      setEmailVerifying(false);
    }
  }, [close, pendingRequirements, setLoggedInUser, t]);

  const openExternalLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-[340px]"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Hide the default close button */}
        <style>{`.absolute.top-4.right-4 { display: none; }`}</style>

        <DialogHeader>
          <DialogTitle>{t("requirements.title")}</DialogTitle>
          <DialogDescription>{t("requirements.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Legal Agreements Section */}
          {needsTos && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-white/70">
                {t("requirements.legalAgreements")}
              </h3>

              {/* Terms of Service */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="tos"
                  checked={tosChecked}
                  onCheckedChange={(checked) => setTosChecked(checked === true)}
                />
                <Label
                  htmlFor="tos"
                  className="text-sm leading-tight text-white"
                >
                  {t("requirements.tosLabel")}{" "}
                  <button
                    type="button"
                    onClick={() => openExternalLink(TOS_URL)}
                    className="inline-flex items-center gap-1 text-blue-400 underline hover:text-blue-300"
                  >
                    {t("requirements.tosLink")}
                    <ExternalLinkIcon className="h-3 w-3" />
                  </button>
                </Label>
              </div>

              {/* Privacy Policy */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="privacy"
                  checked={privacyChecked}
                  onCheckedChange={(checked) =>
                    setPrivacyChecked(checked === true)
                  }
                />
                <Label
                  htmlFor="privacy"
                  className="text-sm leading-tight text-white"
                >
                  {t("requirements.privacyLabel")}{" "}
                  <button
                    type="button"
                    onClick={() => openExternalLink(PRIVACY_URL)}
                    className="inline-flex items-center gap-1 text-blue-400 underline hover:text-blue-300"
                  >
                    {t("requirements.privacyLink")}
                    <ExternalLinkIcon className="h-3 w-3" />
                  </button>
                </Label>
              </div>
            </div>
          )}

          {/* Age Verification Section */}
          {needsAge && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-white/70">
                {t("requirements.ageVerification")}
              </h3>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="age"
                  checked={ageChecked}
                  onCheckedChange={(checked) => setAgeChecked(checked === true)}
                />
                <Label
                  htmlFor="age"
                  className="text-sm leading-tight text-white"
                >
                  {t("requirements.ageLabel")}
                </Label>
              </div>
            </div>
          )}

          {/* Email Verification Section */}
          {needsEmailVerification && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-white/70">
                {t("requirements.emailVerification")}
              </h3>

              {!emailSent ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    {t("requirements.emailDescription")}
                  </p>
                  <Button
                    label={t("requirements.sendVerificationEmail")}
                    icon={<MailIcon size={18} />}
                    variant="outline"
                    onClick={handleSendVerificationEmail}
                    className="w-full"
                  />
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    {t("requirements.emailSentMessage")}
                  </p>
                  <Button
                    label={
                      emailVerifying
                        ? t("requirements.checking")
                        : t("requirements.checkEmailVerified")
                    }
                    variant="outline"
                    onClick={handleCheckEmailVerified}
                    disabled={emailVerifying}
                    className="w-full"
                  />
                  <button
                    type="button"
                    onClick={handleSendVerificationEmail}
                    className="text-muted-foreground text-center text-sm underline hover:text-white"
                  >
                    {t("requirements.resendEmail")}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Inline status message */}
          {statusMessage && (
            <p
              className={
                statusMessage.type === "error"
                  ? "text-sm text-red-400"
                  : "text-sm text-green-400"
              }
            >
              {statusMessage.text}
            </p>
          )}

          {/* Action Buttons */}
          <div className="mt-2 flex flex-col gap-3">
            {hasCheckboxRequirements && (
              <Button
                label={isSaving ? t("loading") : t("requirements.save")}
                onClick={handleSave}
                disabled={!canSave || isSaving}
                intent="primary"
                className="w-full"
              />
            )}

            <Button
              label={isLoggingOut ? t("loading") : t("requirements.logout")}
              icon={<LogOutIcon size={18} />}
              variant="outline"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

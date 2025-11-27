import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import toast from "react-hot-toast";
import { Browser } from "@capacitor/browser";
import { ExternalLinkIcon, LogInIcon, LogOutIcon } from "lucide-react";
import { TextInput } from "../components/wui/TextInput.tsx";
import { Button } from "../components/wui/Button.tsx";
import { useStatusStore } from "../lib/store.ts";
import { PageFrame } from "../components/PageFrame.tsx";
import { useSmartSwipe } from "../hooks/useSmartSwipe";

export const Route = createFileRoute("/settings/online")({
  component: About
});

function About() {
  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false
  });

  const { t } = useTranslation();

  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);
  const [onlineEmail, setOnlineEmail] = useState("");
  const [onlinePassword, setOnlinePassword] = useState("");
  const [onlineLoggingIn, setOnlineLoggingIn] = useState(false);

  return (
    <PageFrame
      {...swipeHandlers}
      title={t("online.title")}
      back={goBack}
    >
        <div className="flex flex-col gap-3">
          <Button
            label={t("online.openDashboard")}
            className="w-full"
            icon={<ExternalLinkIcon size="20" />}
            onClick={() =>
              Browser.open({ url: "https://zaparoo.com/dashboard" })
            }
          />

          {loggedInUser !== null ? (
            <div className="flex flex-col gap-3">
              <span>
                {t("online.loggedInAs", { email: loggedInUser.email })}
              </span>
              <div className="flex flex-col gap-3">
                <Button
                  label={t("online.logout")}
                  icon={<LogOutIcon size="20" />}
                  onClick={() => {
                    FirebaseAuthentication.signOut()
                      .then(() => {
                        setLoggedInUser(null);
                        setOnlineEmail("");
                        setOnlinePassword("");
                      })
                      .catch((e) => {
                        console.error(e);
                      });
                  }}
                  className="w-full"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <TextInput
                label={t("online.email")}
                placeholder="me@example.com"
                value={onlineEmail}
                setValue={setOnlineEmail}
              />
              <TextInput
                label={t("online.password")}
                placeholder=""
                type="password"
                value={onlinePassword}
                setValue={setOnlinePassword}
              />
              <Button
                label={t("online.login")}
                icon={<LogInIcon size="20" />}
                onClick={() => {
                  setOnlineLoggingIn(true);
                  FirebaseAuthentication.signInWithEmailAndPassword({
                    email: onlineEmail,
                    password: onlinePassword
                  })
                    .then((result) => {
                      if (result) {
                        toast.success(t("online.loginSuccess"));
                      } else {
                        toast.error(t("online.loginWrong"));
                      }
                      setLoggedInUser(result.user);
                      setOnlineLoggingIn(false);
                    })
                    .catch((e: Error) => {
                      console.error(e);
                      toast.error(t("online.loginWrong"));
                      setOnlineLoggingIn(false);
                      setLoggedInUser(null);
                    });
                }}
                disabled={!onlineEmail || !onlinePassword || onlineLoggingIn}
                className="w-full"
              />
              <Button
                label={t("online.loginGoogle")}
                className="w-full"
                onClick={() =>
                  FirebaseAuthentication.signInWithGoogle()
                    .then((result) => {
                      if (result) {
                        toast.success(t("online.loginSuccess"));
                      } else {
                        toast.error(t("online.loginWrong"));
                      }
                      setLoggedInUser(result.user);
                    })
                    .catch((e: Error) => {
                      console.error(e);
                      toast.error(t("online.loginWrong"));
                      setLoggedInUser(null);
                    })
                }
              />
            </div>
          )}
        </div>
      </PageFrame>
  );
}

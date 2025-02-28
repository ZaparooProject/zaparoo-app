import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSwipeable } from "react-swipeable";
import { PageFrame } from "../components/PageFrame.tsx";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "../lib/store.ts";
import { useState } from "react";
import { Button } from "../components/wui/Button.tsx";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { TextInput } from "../components/wui/TextInput.tsx";
import toast from "react-hot-toast";
import { Browser } from "@capacitor/browser";
import { LayoutDashboardIcon } from "lucide-react";

export const Route = createFileRoute("/settings/online")({
  component: About
});

function About() {
  const navigate = useNavigate();
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate({ to: "/settings" })
  });

  const { t } = useTranslation();

  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);
  const [onlineEmail, setOnlineEmail] = useState("");
  const [onlinePassword, setOnlinePassword] = useState("");
  const [onlineLoggingIn, setOnlineLoggingIn] = useState(false);

  return (
    <div {...swipeHandlers}>
      <PageFrame
        title={t("online.title")}
        back={() => navigate({ to: "/settings" })}
      >
        <div className="flex flex-col gap-3">
          <Button
            label={t("online.openDashboard")}
            className="w-full"
            icon={<LayoutDashboardIcon size="20" />}
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
            </div>
          )}
        </div>
      </PageFrame>
    </div>
  );
}

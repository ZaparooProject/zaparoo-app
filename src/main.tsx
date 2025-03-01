import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import "./i18n";
import "./index.css";

import App from "./App";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

import { initializeApp } from "firebase/app";
import firebaseConfig from "./firebase.json";

import * as Sentry from "@sentry/capacitor";
import * as SentryReact from "@sentry/react";
import { ThemeProvider } from "./components/theme-provider";

if (import.meta.env.PROD) {
  Sentry.init(
    {
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [
        Sentry.browserTracingIntegration(),
        SentryReact.captureConsoleIntegration({
          levels: ["error"]
        })
      ]
    },
    SentryReact.init
  );
}

initializeApp(firebaseConfig);

const queryClient = new QueryClient();

Preferences.get({ key: "apiUrl" }).then((res) => {
  if (res.value && localStorage.getItem("apiUrl") === null) {
    localStorage.setItem("apiUrl", res.value);
    window.location.reload();
  }
});

const onDeviceReady = async () => {
  if (import.meta.env.MODE === "development") {
    await Purchases.setLogLevel({
      level: LOG_LEVEL.DEBUG
    });
  }

  if (Capacitor.getPlatform() === "ios") {
    await Purchases.configure({ apiKey: import.meta.env.VITE_APPLE_STORE_API });
  } else if (Capacitor.getPlatform() === "android") {
    await Purchases.configure({
      apiKey: import.meta.env.VITE_GOOGLE_STORE_API
    });
  }
};
document.addEventListener("deviceready", onDeviceReady, false);

const rootElement = document.getElementById("app")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>
  );
}

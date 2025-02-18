import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import "./i18n";
import "./index.css";

import App from "./App";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

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
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
}

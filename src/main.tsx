import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { initializeApp } from "firebase/app";
import { Provider as RollbarProvider, ErrorBoundary } from "@rollbar/react";
import App from "./App";
import firebaseConfig from "./firebase.json";
import { ThemeProvider } from "./components/theme-provider";
import { rollbarConfig, isRollbarEnabled } from "./lib/rollbar";
import { ErrorComponent } from "./components/ErrorComponent";

initializeApp(firebaseConfig);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000 // 30 seconds - prevents refetch flicker on navigation
    }
  }
});

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

// App content wrapped in theme and query providers
const AppContent = (
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ThemeProvider>
);

const rootElement = document.getElementById("app")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      {isRollbarEnabled ? (
        <RollbarProvider config={rollbarConfig}>
          <ErrorBoundary
            fallbackUI={({ error }) => (
              <ErrorComponent error={error ?? new Error("Unknown error")} />
            )}
          >
            {AppContent}
          </ErrorBoundary>
        </RollbarProvider>
      ) : (
        AppContent
      )}
    </StrictMode>
  );
}

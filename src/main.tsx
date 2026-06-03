import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { initializeApp } from "firebase/app";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { ErrorComponent } from "./components/ErrorComponent";
import { logger } from "./lib/logger";
import { resolvePurchasesReady } from "./lib/purchasesSetup";
import { isPluginAvailable } from "./lib/capacitorBridge";

// Firebase config is optional - auth features will be disabled without it
const firebaseConfigs = import.meta.glob<Record<string, string>>(
  "./firebase.json",
  { eager: true, import: "default" },
);
const firebaseConfig = firebaseConfigs["./firebase.json"];

if (firebaseConfig && firebaseConfig.apiKey) {
  initializeApp(firebaseConfig);
} else {
  logger.warn("Firebase config not found - auth features disabled");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds - prevents refetch flicker on navigation
    },
  },
});

if (isPluginAvailable("Preferences")) {
  Preferences.get({ key: "apiUrl" })
    .then((res) => {
      if (res.value && localStorage.getItem("apiUrl") === null) {
        localStorage.setItem("apiUrl", res.value);
        window.location.reload();
      }
    })
    .catch(() => {
      // Silently ignore - migration from Preferences to localStorage is optional
    });
}

let purchasesInitializationStarted = false;

const initializePurchasesOnce = async () => {
  if (purchasesInitializationStarted) return;
  purchasesInitializationStarted = true;

  if (!Capacitor.isNativePlatform() || !isPluginAvailable("Purchases")) {
    resolvePurchasesReady();
    return;
  }

  try {
    if (import.meta.env.MODE === "development") {
      await Purchases.setLogLevel({
        level: LOG_LEVEL.DEBUG,
      });
    }

    if (Capacitor.getPlatform() === "ios") {
      await Purchases.configure({
        apiKey: import.meta.env.VITE_APPLE_STORE_API,
      });
    } else if (Capacitor.getPlatform() === "android") {
      await Purchases.configure({
        apiKey: import.meta.env.VITE_GOOGLE_STORE_API,
      });
    }
  } catch (e) {
    logger.error("Purchases configure failed:", e, {
      category: "purchase",
      action: "configure",
      severity: "error",
    });
  } finally {
    resolvePurchasesReady();
  }
};

if (!Capacitor.isNativePlatform() || !isPluginAvailable("Purchases")) {
  initializePurchasesOnce();
} else {
  document.addEventListener("deviceready", initializePurchasesOnce, false);
  window.setTimeout(() => {
    initializePurchasesOnce();
  }, 1500);
}

// App content wrapped in theme and query providers
const AppContent = (
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ThemeProvider>
);

// Check if Rollbar should be enabled (native + production + token present)
const isNative = Capacitor.isNativePlatform();
const isProduction = import.meta.env.PROD;
const shouldEnableRollbar =
  isNative && isProduction && !!import.meta.env.VITE_ROLLBAR_ACCESS_TOKEN;

async function renderApp() {
  const rootElement = document.getElementById("app")!;
  if (rootElement.innerHTML) return;

  const root = ReactDOM.createRoot(rootElement);

  if (shouldEnableRollbar) {
    // Lazy-load Rollbar only on native platforms to reduce web bundle size
    const [{ Provider: RollbarProvider, ErrorBoundary }, { rollbarConfig }] =
      await Promise.all([import("@rollbar/react"), import("./lib/rollbar")]);

    root.render(
      <StrictMode>
        <RollbarProvider config={rollbarConfig}>
          <ErrorBoundary
            fallbackUI={({ error }) => (
              <ErrorComponent error={error ?? new Error("Unknown error")} />
            )}
          >
            {AppContent}
          </ErrorBoundary>
        </RollbarProvider>
      </StrictMode>,
    );
  } else {
    root.render(<StrictMode>{AppContent}</StrictMode>);
  }
}

renderApp();

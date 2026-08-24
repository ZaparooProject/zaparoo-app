import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { initializeApp } from "firebase/app";
import { isPluginAvailable } from "@/lib/capacitorBridge";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { ErrorComponent } from "./components/ErrorComponent";
import { logger } from "./lib/logger";
import {
  rejectPurchasesReady,
  resolvePurchasesReady,
  settlePurchasesReadyAfterConfiguration,
} from "./lib/purchasesSetup";

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

    const platform = Capacitor.getPlatform();
    const apiKey =
      platform === "ios"
        ? import.meta.env.VITE_APPLE_STORE_API
        : platform === "android"
          ? import.meta.env.VITE_GOOGLE_STORE_API
          : undefined;

    if (!apiKey) {
      // A bundle built without the RevenueCat key (e.g. a local live-update
      // build missing .env) would otherwise configure with an empty key and
      // silently break every purchase on this build. Fail loudly instead.
      throw new Error(
        `RevenueCat API key is missing for platform "${platform}"`,
      );
    }

    if (platform === "ios" || platform === "android") {
      await settlePurchasesReadyAfterConfiguration(
        Purchases.configure({ apiKey }),
        (error) => {
          logger.error(
            "Purchases configure timed out; waiting for completion:",
            error,
            {
              category: "purchase",
              action: "configure",
              severity: "warning",
            },
          );
        },
      );
    } else {
      resolvePurchasesReady();
    }
  } catch (e) {
    rejectPurchasesReady(e);
    logger.error("Purchases configure failed:", e, {
      category: "purchase",
      action: "configure",
      severity: "error",
    });
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

import { CapacitorConfig } from "@capacitor/cli";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const config: CapacitorConfig = {
  webDir: "dist",
  appId: "dev.wizzo.tapto",
  appName: "Zaparoo",
  backgroundColor: "#111928",
  server: {
    url:
      process.env.NODE_ENV === "development" && process.env.DEV_SERVER_IP
        ? `http://${process.env.DEV_SERVER_IP}:8100`
        : undefined,
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com", "apple.com"],
      // TODO: authDomain config is not working on Android due to a bug in
      // @capacitor-firebase/authentication. The plugin's getFirebaseAuthenticationConfig()
      // in FirebaseAuthenticationPlugin.java reads skipNativeAuth and providers, but does
      // NOT read authDomain from config (even though FirebaseAuthentication.java has code
      // to use it via setCustomAuthDomain). OAuth flows on Android will show
      // firebaseapp.com instead of online.zaparoo.com until this is fixed upstream.
      // See: https://github.com/capawesome-team/capacitor-firebase/pull/894
      authDomain: "online.zaparoo.com",
    },
    StatusBar: {
      overlaysWebView: true,
    },
    LiveUpdate: {
      appId: "e96c260c-3271-4895-bff0-de9f8ca4d05a",
      autoUpdateStrategy: "background",
      defaultChannel: "production",
      readyTimeout: 10000,
      publicKey:
        "-----BEGIN PUBLIC KEY-----MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA9VF6x0L6R3Sq8Xk4NdNV6oR+Te7RyiaFaTsbsrzHrzWpk3g6WQrBCZoE2xSmvlTUeroEu4EW2JotftOmklkt7hRWKaxtwuCp6CwtUsBHmK9WWDdygSGqHUlotx+TMnLRKFrXsTVMPdbxfYkP2srsiNnL7CYjjdDn65xAHZ79JcR1k0JrCGgW5xDDsxeT54A8x+obtezMA8iIun1etmDeb03KHSshtkYVPmmBPjOxre9/zkjF12je6ZpsK3Vdt00HmN5sMCXvBVEv5ZKvsGDYpEXPZidIHvA/4So0FHnFT5PsGktYk/PLtirP7frA6v3xhj1Gwlr4ffnGTGHLqe4TJwIDAQAB-----END PUBLIC KEY-----",
    },
  },
};

export default config;

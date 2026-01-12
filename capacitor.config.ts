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
  },
};

export default config;

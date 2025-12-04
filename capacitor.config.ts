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
      providers: ["google.com"],
    },
    EdgeToEdge: {
      backgroundColor: "#111928",
    },
    StatusBar: {
      overlaysWebView: true,
    },
  },
};

export default config;

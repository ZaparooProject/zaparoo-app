import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  webDir: "dist",
  appId: "dev.wizzo.tapto",
  appName: "Zaparoo",
  backgroundColor: "#111928",
  server: {
    // url: "http://10.0.0.228:8100",
    androidScheme: "http",
    cleartext: true
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    FirebaseAuthentication: {
      providers: []
    }
  }
};

export default config;

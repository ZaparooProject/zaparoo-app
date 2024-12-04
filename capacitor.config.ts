import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  webDir: "dist",
  appId: "dev.wizzo.tapto",
  appName: "Zaparoo",
  backgroundColor: "#111928",
  server: {
    androidScheme: "http",
    cleartext: true
    // REMOVE ME FOR RELEASE
    // url: "http://10.0.0.228:8100"
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: false
    },
    FirebaseAuthentication: {
      providers: []
    },
  }
};

export default config;

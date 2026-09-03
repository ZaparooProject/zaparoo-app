import { Capacitor } from "@capacitor/core";
import type { SignupAttribution } from "@/lib/models";

/**
 * The sign-up origin the App reports with its requirements call after a
 * person creates an account: the App itself, and which platform build.
 *
 * This is not telemetry. It carries no identifier, nothing about the device
 * beyond the platform name, and is sent once alongside the consent update
 * that every sign-up already makes. The API records it only for a brand-new
 * account and ignores it afterwards, so sending it on a log-in is harmless
 * and lets an account created through Google or Apple sign-in (which lands
 * on the same path as a log-in) be attributed too.
 */
export function signupAttribution(): SignupAttribution {
  return {
    source: "zaparoo-app",
    medium: "app",
    content: Capacitor.getPlatform(),
  };
}

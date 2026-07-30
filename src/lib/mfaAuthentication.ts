import { Capacitor, registerPlugin } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

export interface MfaEmailSignInOptions {
  email: string;
  password: string;
}

export interface MfaSignInResult {
  mfaRequired: boolean;
}

export type MfaOAuthProviderId = "google.com" | "apple.com";

export interface MfaOAuthCredentialOptions {
  providerId: MfaOAuthProviderId;
  idToken: string;
  accessToken?: string;
  nonce?: string;
  displayName?: string;
}

export interface ResolveTotpSignInOptions {
  code: string;
}

export interface MfaAuthenticationPlugin {
  signInWithEmailAndPassword(
    options: MfaEmailSignInOptions,
  ): Promise<MfaSignInResult>;
  signInWithOAuthCredential(
    options: MfaOAuthCredentialOptions,
  ): Promise<MfaSignInResult>;
  signInWithGoogle(): Promise<MfaSignInResult>;
  signInWithApple(): Promise<MfaSignInResult>;
  resolveTotpSignIn(options: ResolveTotpSignInOptions): Promise<void>;
  cancelSignIn(): Promise<void>;
}

const bridge = registerPlugin<MfaAuthenticationPlugin>("MfaAuthentication", {
  web: () =>
    import("@/lib/mfaAuthentication.web").then(
      ({ MfaAuthenticationWeb }) => new MfaAuthenticationWeb(),
    ),
});

function requireCredentialValue(
  value: string | undefined,
  provider: MfaOAuthProviderId,
  field: string,
): string {
  if (value) return value;
  throw Object.assign(
    new Error(`Firebase ${provider} sign-in did not return ${field}.`),
    { code: "auth/missing-oauth-credential" },
  );
}

export const MfaAuthentication = {
  signInWithEmailAndPassword: (options: MfaEmailSignInOptions) =>
    bridge.signInWithEmailAndPassword(options),

  async signInWithGoogle(): Promise<MfaSignInResult> {
    if (!Capacitor.isNativePlatform()) {
      return bridge.signInWithGoogle();
    }

    const { credential } = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
    });
    return bridge.signInWithOAuthCredential({
      providerId: "google.com",
      idToken: requireCredentialValue(
        credential?.idToken,
        "google.com",
        "an ID token",
      ),
      accessToken: credential?.accessToken,
    });
  },

  async signInWithApple(): Promise<MfaSignInResult> {
    if (!Capacitor.isNativePlatform()) {
      return bridge.signInWithApple();
    }

    // Android's Firebase SDK owns the Apple browser flow, so the native bridge
    // must start it directly to retain any MFA resolver returned by Firebase.
    if (Capacitor.getPlatform() === "android") {
      return bridge.signInWithApple();
    }

    const { credential, user } = await FirebaseAuthentication.signInWithApple({
      skipNativeAuth: true,
    });
    return bridge.signInWithOAuthCredential({
      providerId: "apple.com",
      idToken: requireCredentialValue(
        credential?.idToken,
        "apple.com",
        "an ID token",
      ),
      nonce: requireCredentialValue(credential?.nonce, "apple.com", "a nonce"),
      accessToken: credential?.accessToken,
      displayName: user?.displayName ?? undefined,
    });
  },

  resolveTotpSignIn: (options: ResolveTotpSignInOptions) =>
    bridge.resolveTotpSignIn(options),

  cancelSignIn: () => bridge.cancelSignIn(),
};

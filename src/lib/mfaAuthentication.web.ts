import { WebPlugin } from "@capacitor/core";
import {
  getAuth,
  getMultiFactorResolver,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
} from "firebase/auth";
import type {
  MfaAuthenticationPlugin,
  MfaEmailSignInOptions,
  MfaOAuthCredentialOptions,
  MfaSignInResult,
  ResolveTotpSignInOptions,
} from "@/lib/mfaAuthentication";

function isMfaRequiredError(error: unknown): error is MultiFactorError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "auth/multi-factor-auth-required"
  );
}

function createMfaError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

export class MfaAuthenticationWeb
  extends WebPlugin
  implements MfaAuthenticationPlugin
{
  private pendingResolver: MultiFactorResolver | null = null;

  private async runSignIn(
    operation: () => Promise<unknown>,
  ): Promise<MfaSignInResult> {
    this.pendingResolver = null;

    try {
      await operation();
      return { mfaRequired: false };
    } catch (error) {
      if (!isMfaRequiredError(error)) {
        throw error;
      }

      const resolver = getMultiFactorResolver(getAuth(), error);
      const hasTotpFactor = resolver.hints.some(
        (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      );
      if (!hasTotpFactor) {
        throw createMfaError(
          "No authenticator app is enrolled for this account.",
          "auth/unsupported-second-factor",
        );
      }

      this.pendingResolver = resolver;
      return { mfaRequired: true };
    }
  }

  async signInWithEmailAndPassword({
    email,
    password,
  }: MfaEmailSignInOptions): Promise<MfaSignInResult> {
    return this.runSignIn(() =>
      signInWithEmailAndPassword(getAuth(), email, password),
    );
  }

  async signInWithOAuthCredential({
    providerId,
    idToken,
    accessToken,
    nonce,
  }: MfaOAuthCredentialOptions): Promise<MfaSignInResult> {
    const credential =
      providerId === "google.com"
        ? GoogleAuthProvider.credential(idToken, accessToken)
        : new OAuthProvider("apple.com").credential({
            idToken,
            accessToken,
            rawNonce: nonce,
          });
    return this.runSignIn(() => signInWithCredential(getAuth(), credential));
  }

  async signInWithGoogle(): Promise<MfaSignInResult> {
    const provider = new GoogleAuthProvider();
    return this.runSignIn(() => signInWithPopup(getAuth(), provider));
  }

  async signInWithApple(): Promise<MfaSignInResult> {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    return this.runSignIn(() => signInWithPopup(getAuth(), provider));
  }

  async resolveTotpSignIn({ code }: ResolveTotpSignInOptions): Promise<void> {
    const resolver = this.pendingResolver;
    if (!resolver) {
      throw createMfaError(
        "The multi-factor sign-in challenge is no longer available.",
        "auth/multi-factor-challenge-missing",
      );
    }

    const hint = resolver.hints.find(
      (candidate) => candidate.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    );
    if (!hint) {
      throw createMfaError(
        "No authenticator app is enrolled for this account.",
        "auth/unsupported-second-factor",
      );
    }

    const assertion = TotpMultiFactorGenerator.assertionForSignIn(
      hint.uid,
      code,
    );
    await resolver.resolveSignIn(assertion);
    this.pendingResolver = null;
  }

  async cancelSignIn(): Promise<void> {
    this.pendingResolver = null;
  }
}

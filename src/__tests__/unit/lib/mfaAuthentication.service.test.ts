import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBridge, mockFirebaseAuthentication, mockPlatform } = vi.hoisted(
  () => ({
    mockBridge: {
      signInWithEmailAndPassword: vi.fn(),
      signInWithOAuthCredential: vi.fn(),
      signInWithGoogle: vi.fn(),
      signInWithApple: vi.fn(),
      resolveTotpSignIn: vi.fn(),
      cancelSignIn: vi.fn(),
    },
    mockFirebaseAuthentication: {
      signInWithGoogle: vi.fn(),
      signInWithApple: vi.fn(),
    },
    mockPlatform: { value: "web" as string },
  }),
);

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockPlatform.value !== "web",
    getPlatform: () => mockPlatform.value,
  },
  registerPlugin: () => mockBridge,
}));

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: mockFirebaseAuthentication,
}));

import { MfaAuthentication } from "@/lib/mfaAuthentication";

describe("MfaAuthentication service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.value = "web";
    mockBridge.signInWithEmailAndPassword.mockResolvedValue({
      mfaRequired: false,
    });
    mockBridge.signInWithOAuthCredential.mockResolvedValue({
      mfaRequired: false,
    });
    mockBridge.signInWithGoogle.mockResolvedValue({ mfaRequired: false });
    mockBridge.signInWithApple.mockResolvedValue({ mfaRequired: false });
    mockBridge.resolveTotpSignIn.mockResolvedValue(undefined);
    mockBridge.cancelSignIn.mockResolvedValue(undefined);
    mockFirebaseAuthentication.signInWithGoogle.mockResolvedValue({
      credential: {
        providerId: "google.com",
        idToken: "google-id-token",
        accessToken: "google-access-token",
      },
    });
    mockFirebaseAuthentication.signInWithApple.mockResolvedValue({
      credential: {
        providerId: "apple.com",
        idToken: "apple-id-token",
        accessToken: "apple-access-token",
        nonce: "apple-nonce",
      },
      user: { displayName: "Apple User" },
    });
  });

  it("should delegate email and password login to the bridge", async () => {
    const options = {
      email: "test@example.com",
      password: "password123",
    };

    await expect(
      MfaAuthentication.signInWithEmailAndPassword(options),
    ).resolves.toEqual({ mfaRequired: false });

    expect(mockBridge.signInWithEmailAndPassword).toHaveBeenCalledWith(options);
  });

  it("should delegate TOTP resolution to the bridge", async () => {
    const options = { code: "123456" };

    await MfaAuthentication.resolveTotpSignIn(options);

    expect(mockBridge.resolveTotpSignIn).toHaveBeenCalledWith(options);
  });

  it("should delegate cancellation to the bridge", async () => {
    await MfaAuthentication.cancelSignIn();

    expect(mockBridge.cancelSignIn).toHaveBeenCalledWith();
  });

  it("should use web bridge for Google login in browser", async () => {
    await MfaAuthentication.signInWithGoogle();

    expect(mockBridge.signInWithGoogle).toHaveBeenCalled();
    expect(mockFirebaseAuthentication.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("should pass native Google credential to MFA bridge", async () => {
    mockPlatform.value = "ios";

    await MfaAuthentication.signInWithGoogle();

    expect(mockFirebaseAuthentication.signInWithGoogle).toHaveBeenCalledWith({
      skipNativeAuth: true,
    });
    expect(mockBridge.signInWithOAuthCredential).toHaveBeenCalledWith({
      providerId: "google.com",
      idToken: "google-id-token",
      accessToken: "google-access-token",
    });
  });

  it("should retry Android Google login with the account picker when Credential Manager has no credentials", async () => {
    mockPlatform.value = "android";
    mockFirebaseAuthentication.signInWithGoogle.mockRejectedValueOnce(
      new Error("No credentials available"),
    );

    await expect(MfaAuthentication.signInWithGoogle()).resolves.toEqual({
      mfaRequired: false,
    });

    expect(mockFirebaseAuthentication.signInWithGoogle).toHaveBeenCalledTimes(
      2,
    );
    expect(
      mockFirebaseAuthentication.signInWithGoogle,
    ).toHaveBeenLastCalledWith({
      skipNativeAuth: true,
      useCredentialManager: false,
    });
    expect(mockBridge.signInWithOAuthCredential).toHaveBeenCalledWith({
      providerId: "google.com",
      idToken: "google-id-token",
      accessToken: "google-access-token",
    });
  });

  it("should not retry Android Google login for other Credential Manager failures", async () => {
    mockPlatform.value = "android";
    const cancelled = new Error("activity is cancelled by the user.");
    mockFirebaseAuthentication.signInWithGoogle.mockRejectedValueOnce(
      cancelled,
    );

    await expect(MfaAuthentication.signInWithGoogle()).rejects.toBe(cancelled);

    expect(mockFirebaseAuthentication.signInWithGoogle).toHaveBeenCalledOnce();
    expect(mockBridge.signInWithOAuthCredential).not.toHaveBeenCalled();
  });

  it("should surface the account picker failure when the Android retry fails", async () => {
    mockPlatform.value = "android";
    const pickerFailure = new Error("12501: ");
    mockFirebaseAuthentication.signInWithGoogle
      .mockRejectedValueOnce(new Error("No credentials available"))
      .mockRejectedValueOnce(pickerFailure);

    await expect(MfaAuthentication.signInWithGoogle()).rejects.toBe(
      pickerFailure,
    );

    expect(mockBridge.signInWithOAuthCredential).not.toHaveBeenCalled();
  });

  it("should pass native iOS Apple credential to MFA bridge", async () => {
    mockPlatform.value = "ios";

    await MfaAuthentication.signInWithApple();

    expect(mockFirebaseAuthentication.signInWithApple).toHaveBeenCalledWith({
      skipNativeAuth: true,
    });
    expect(mockBridge.signInWithOAuthCredential).toHaveBeenCalledWith({
      providerId: "apple.com",
      idToken: "apple-id-token",
      accessToken: "apple-access-token",
      nonce: "apple-nonce",
      displayName: "Apple User",
    });
  });

  it("should let Android bridge own Apple login", async () => {
    mockPlatform.value = "android";

    await MfaAuthentication.signInWithApple();

    expect(mockBridge.signInWithApple).toHaveBeenCalled();
    expect(mockFirebaseAuthentication.signInWithApple).not.toHaveBeenCalled();
    expect(mockBridge.signInWithOAuthCredential).not.toHaveBeenCalled();
  });

  it("should reject missing native Google ID token", async () => {
    mockPlatform.value = "android";
    mockFirebaseAuthentication.signInWithGoogle.mockResolvedValueOnce({
      credential: { providerId: "google.com" },
    });

    await expect(MfaAuthentication.signInWithGoogle()).rejects.toMatchObject({
      code: "auth/missing-oauth-credential",
    });
    expect(mockBridge.signInWithOAuthCredential).not.toHaveBeenCalled();
  });

  it("should reject missing native Apple nonce", async () => {
    mockPlatform.value = "ios";
    mockFirebaseAuthentication.signInWithApple.mockResolvedValueOnce({
      credential: {
        providerId: "apple.com",
        idToken: "apple-id-token",
      },
    });

    await expect(MfaAuthentication.signInWithApple()).rejects.toMatchObject({
      code: "auth/missing-oauth-credential",
    });
    expect(mockBridge.signInWithOAuthCredential).not.toHaveBeenCalled();
  });
});

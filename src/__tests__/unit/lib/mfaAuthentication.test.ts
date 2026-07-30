import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaAuthenticationWeb } from "@/lib/mfaAuthentication.web";

vi.mock("@capacitor/core", () => ({
  WebPlugin: class {},
}));

const {
  mockGetAuth,
  mockGetMultiFactorResolver,
  mockSignInWithEmailAndPassword,
  mockSignInWithCredential,
  mockSignInWithPopup,
  mockGoogleCredential,
  mockAppleCredential,
  mockAddAppleScope,
  mockAssertionForSignIn,
  mockResolveSignIn,
  mockResolver,
} = vi.hoisted(() => {
  const mockResolveSignIn = vi.fn();
  const mockResolver = {
    hints: [{ factorId: "totp", uid: "totp-enrollment" }],
    resolveSignIn: mockResolveSignIn,
  };

  return {
    mockGetAuth: vi.fn(() => ({ name: "auth" })),
    mockGetMultiFactorResolver: vi.fn(() => mockResolver),
    mockSignInWithEmailAndPassword: vi.fn(),
    mockSignInWithCredential: vi.fn(),
    mockSignInWithPopup: vi.fn(),
    mockGoogleCredential: vi.fn((_idToken: string, _accessToken?: string) => ({
      provider: "google.com",
    })),
    mockAppleCredential: vi.fn((_options: unknown) => ({
      provider: "apple.com",
    })),
    mockAddAppleScope: vi.fn(),
    mockAssertionForSignIn: vi.fn(() => ({ assertion: true })),
    mockResolveSignIn,
    mockResolver,
  };
});

vi.mock("firebase/auth", () => ({
  getAuth: mockGetAuth,
  getMultiFactorResolver: mockGetMultiFactorResolver,
  GoogleAuthProvider: class {
    static credential(idToken: string, accessToken?: string) {
      return mockGoogleCredential(idToken, accessToken);
    }
  },
  OAuthProvider: class {
    constructor(public providerId: string) {}
    addScope(scope: string) {
      mockAddAppleScope(scope);
    }
    credential(options: unknown) {
      return mockAppleCredential(options);
    }
  },
  signInWithCredential: mockSignInWithCredential,
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
  signInWithPopup: mockSignInWithPopup,
  TotpMultiFactorGenerator: {
    FACTOR_ID: "totp",
    assertionForSignIn: mockAssertionForSignIn,
  },
}));

describe("MfaAuthenticationWeb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithEmailAndPassword.mockResolvedValue({ user: {} });
    mockSignInWithCredential.mockResolvedValue({ user: {} });
    mockSignInWithPopup.mockResolvedValue({ user: {} });
    mockResolveSignIn.mockResolvedValue({ user: {} });
    mockResolver.hints = [{ factorId: "totp", uid: "totp-enrollment" }];
  });

  it("should complete email login without MFA", async () => {
    const plugin = new MfaAuthenticationWeb();

    await expect(
      plugin.signInWithEmailAndPassword({
        email: "test@example.com",
        password: "password123",
      }),
    ).resolves.toEqual({ mfaRequired: false });

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
      { name: "auth" },
      "test@example.com",
      "password123",
    );
    expect(mockGetMultiFactorResolver).not.toHaveBeenCalled();
  });

  it("should retain resolver when MFA is required", async () => {
    const plugin = new MfaAuthenticationWeb();
    const mfaError = Object.assign(new Error("MFA required"), {
      code: "auth/multi-factor-auth-required",
    });
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(mfaError);

    await expect(
      plugin.signInWithEmailAndPassword({
        email: "test@example.com",
        password: "password123",
      }),
    ).resolves.toEqual({ mfaRequired: true });

    expect(mockGetMultiFactorResolver).toHaveBeenCalledWith(
      { name: "auth" },
      mfaError,
    );
  });

  it("should retain resolver after Google popup requires MFA", async () => {
    const plugin = new MfaAuthenticationWeb();
    mockSignInWithPopup.mockRejectedValueOnce(
      Object.assign(new Error("MFA required"), {
        code: "auth/multi-factor-auth-required",
      }),
    );

    await expect(plugin.signInWithGoogle()).resolves.toEqual({
      mfaRequired: true,
    });

    expect(mockSignInWithPopup).toHaveBeenCalledWith(
      { name: "auth" },
      expect.any(Object),
    );
    expect(mockGetMultiFactorResolver).toHaveBeenCalled();
  });

  it("should configure Apple popup scopes", async () => {
    const plugin = new MfaAuthenticationWeb();

    await expect(plugin.signInWithApple()).resolves.toEqual({
      mfaRequired: false,
    });

    expect(mockAddAppleScope).toHaveBeenNthCalledWith(1, "email");
    expect(mockAddAppleScope).toHaveBeenNthCalledWith(2, "name");
    expect(mockSignInWithPopup).toHaveBeenCalledWith(
      { name: "auth" },
      expect.objectContaining({ providerId: "apple.com" }),
    );
  });

  it("should sign in with a supplied Apple credential", async () => {
    const plugin = new MfaAuthenticationWeb();

    await plugin.signInWithOAuthCredential({
      providerId: "apple.com",
      idToken: "apple-id-token",
      accessToken: "apple-access-token",
      nonce: "apple-nonce",
    });

    expect(mockAppleCredential).toHaveBeenCalledWith({
      idToken: "apple-id-token",
      accessToken: "apple-access-token",
      rawNonce: "apple-nonce",
    });
    expect(mockSignInWithCredential).toHaveBeenCalledWith(
      { name: "auth" },
      { provider: "apple.com" },
    );
  });

  it("should resolve pending TOTP challenge", async () => {
    const plugin = new MfaAuthenticationWeb();
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(
      Object.assign(new Error("MFA required"), {
        code: "auth/multi-factor-auth-required",
      }),
    );
    await plugin.signInWithEmailAndPassword({
      email: "test@example.com",
      password: "password123",
    });

    await plugin.resolveTotpSignIn({ code: "123456" });

    expect(mockAssertionForSignIn).toHaveBeenCalledWith(
      "totp-enrollment",
      "123456",
    );
    expect(mockResolveSignIn).toHaveBeenCalledWith({ assertion: true });
    await expect(
      plugin.resolveTotpSignIn({ code: "123456" }),
    ).rejects.toMatchObject({ code: "auth/multi-factor-challenge-missing" });
  });

  it("should clear pending challenge on cancel", async () => {
    const plugin = new MfaAuthenticationWeb();
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(
      Object.assign(new Error("MFA required"), {
        code: "auth/multi-factor-auth-required",
      }),
    );
    await plugin.signInWithEmailAndPassword({
      email: "test@example.com",
      password: "password123",
    });

    await plugin.cancelSignIn();

    await expect(
      plugin.resolveTotpSignIn({ code: "123456" }),
    ).rejects.toMatchObject({ code: "auth/multi-factor-challenge-missing" });
  });

  it("should reject an unsupported second factor", async () => {
    const plugin = new MfaAuthenticationWeb();
    mockResolver.hints = [{ factorId: "phone", uid: "phone-enrollment" }];
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(
      Object.assign(new Error("MFA required"), {
        code: "auth/multi-factor-auth-required",
      }),
    );

    await expect(
      plugin.signInWithEmailAndPassword({
        email: "test@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({ code: "auth/unsupported-second-factor" });
  });

  it("should preserve ordinary Firebase login errors", async () => {
    const plugin = new MfaAuthenticationWeb();
    const authError = Object.assign(new Error("Invalid credential"), {
      code: "auth/invalid-credential",
    });
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(authError);

    await expect(
      plugin.signInWithEmailAndPassword({
        email: "test@example.com",
        password: "wrong",
      }),
    ).rejects.toBe(authError);
  });
});

import Foundation
import Capacitor
import FirebaseAuth

@objc(MfaAuthenticationPlugin)
public class MfaAuthenticationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MfaAuthenticationPlugin"
    public let jsName = "MfaAuthentication"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signInWithEmailAndPassword", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithOAuthCredential", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithGoogle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveTotpSignIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelSignIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingResolver: MultiFactorResolver?

    @objc func signInWithEmailAndPassword(_ call: CAPPluginCall) {
        guard let email = call.getString("email"),
              let password = call.getString("password") else {
            call.reject("Email and password are required.", "auth/invalid-argument")
            return
        }

        pendingResolver = nil
        Auth.auth().signIn(withEmail: email, password: password) { _, error in
            self.handleSignInResult(call, error: error)
        }
    }

    @objc func signInWithOAuthCredential(_ call: CAPPluginCall) {
        guard let providerID = call.getString("providerId"),
              let idToken = call.getString("idToken") else {
            call.reject(
                "An OAuth provider and ID token are required.",
                "auth/missing-oauth-credential"
            )
            return
        }

        let credential: AuthCredential
        switch providerID {
        case "google.com":
            guard let accessToken = call.getString("accessToken") else {
                call.reject(
                    "Google sign-in did not return an access token.",
                    "auth/missing-oauth-credential"
                )
                return
            }
            credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: accessToken
            )
        case "apple.com":
            guard let nonce = call.getString("nonce") else {
                call.reject(
                    "Apple sign-in did not return a nonce.",
                    "auth/missing-oauth-credential"
                )
                return
            }
            let fullName = call.getString("displayName").flatMap {
                PersonNameComponentsFormatter().personNameComponents(from: $0)
            }
            credential = OAuthProvider.appleCredential(
                withIDToken: idToken,
                rawNonce: nonce,
                fullName: fullName
            )
        default:
            call.reject(
                "This OAuth provider is not supported.",
                "auth/unsupported-first-factor"
            )
            return
        }

        pendingResolver = nil
        Auth.auth().signIn(with: credential) { _, error in
            self.handleSignInResult(call, error: error)
        }
    }

    @objc func signInWithGoogle(_ call: CAPPluginCall) {
        call.reject(
            "Google authorization must be started by the Firebase Authentication plugin.",
            "auth/operation-not-supported"
        )
    }

    @objc func signInWithApple(_ call: CAPPluginCall) {
        call.reject(
            "Apple authorization must be started by the Firebase Authentication plugin.",
            "auth/operation-not-supported"
        )
    }

    @objc func resolveTotpSignIn(_ call: CAPPluginCall) {
        guard let code = call.getString("code"),
              code.range(of: #"^\d{6}$"#, options: .regularExpression) != nil else {
            call.reject(
                "A 6-digit verification code is required.",
                "auth/invalid-verification-code"
            )
            return
        }
        guard let resolver = pendingResolver else {
            call.reject(
                "The multi-factor sign-in challenge is no longer available.",
                "auth/multi-factor-challenge-missing"
            )
            return
        }
        guard let hint = findTotpHint(in: resolver) else {
            call.reject(
                "No authenticator app is enrolled for this account.",
                "auth/unsupported-second-factor"
            )
            return
        }

        let assertion = TOTPMultiFactorGenerator.assertionForSignIn(
            withEnrollmentID: hint.uid,
            oneTimePassword: code
        )
        resolver.resolveSignIn(with: assertion) { _, error in
            if let error {
                self.reject(call, error: error)
                return
            }

            self.pendingResolver = nil
            call.resolve()
        }
    }

    @objc func cancelSignIn(_ call: CAPPluginCall) {
        pendingResolver = nil
        call.resolve()
    }

    private func handleSignInResult(_ call: CAPPluginCall, error: Error?) {
        if let error {
            let authError = error as NSError
            if authError.code == AuthErrorCode.secondFactorRequired.rawValue,
               let resolver = authError.userInfo[
                   AuthErrors.userInfoMultiFactorResolverKey
               ] as? MultiFactorResolver {
                guard findTotpHint(in: resolver) != nil else {
                    call.reject(
                        "No authenticator app is enrolled for this account.",
                        "auth/unsupported-second-factor"
                    )
                    return
                }

                pendingResolver = resolver
                call.resolve(["mfaRequired": true])
                return
            }

            reject(call, error: error)
            return
        }

        call.resolve(["mfaRequired": false])
    }

    private func findTotpHint(in resolver: MultiFactorResolver) -> MultiFactorInfo? {
        resolver.hints.first { $0.factorID == TOTPMultiFactorID }
    }

    private func reject(_ call: CAPPluginCall, error: Error) {
        let message = error.localizedDescription
        guard let code = firebaseErrorCode(error) else {
            call.reject(message)
            return
        }
        call.reject(message, code)
    }

    private func firebaseErrorCode(_ error: Error) -> String? {
        let authError = error as NSError
        guard let name = authError.userInfo[AuthErrors.userInfoNameKey] as? String else {
            return nil
        }

        let normalized = name
            .replacingOccurrences(of: "ERROR_", with: "")
            .lowercased()
            .replacingOccurrences(of: "_", with: "-")
        return "auth/\(normalized)"
    }
}

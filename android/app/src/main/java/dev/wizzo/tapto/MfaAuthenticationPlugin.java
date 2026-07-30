package dev.wizzo.tapto;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.AuthResult;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseAuthMultiFactorException;
import com.google.firebase.auth.GoogleAuthProvider;
import com.google.firebase.auth.MultiFactorInfo;
import com.google.firebase.auth.MultiFactorResolver;
import com.google.firebase.auth.OAuthProvider;
import com.google.firebase.auth.TotpMultiFactorGenerator;
import java.util.Arrays;
import java.util.Locale;

@CapacitorPlugin(name = "MfaAuthentication")
public class MfaAuthenticationPlugin extends Plugin {
    private MultiFactorResolver pendingResolver;

    @PluginMethod
    public void signInWithEmailAndPassword(PluginCall call) {
        String email = call.getString("email");
        String password = call.getString("password");
        if (email == null || password == null) {
            call.reject("Email and password are required.", "auth/invalid-argument");
            return;
        }

        pendingResolver = null;
        FirebaseAuth.getInstance()
            .signInWithEmailAndPassword(email, password)
            .addOnCompleteListener(getActivity(), task -> handleSignInResult(call, task));
    }

    @PluginMethod
    public void signInWithOAuthCredential(PluginCall call) {
        String providerId = call.getString("providerId");
        String idToken = call.getString("idToken");
        if (providerId == null || idToken == null) {
            call.reject("An OAuth provider and ID token are required.", "auth/missing-oauth-credential");
            return;
        }
        if (!"google.com".equals(providerId)) {
            call.reject("This OAuth provider is not supported on Android.", "auth/unsupported-first-factor");
            return;
        }

        String accessToken = call.getString("accessToken");
        AuthCredential credential = GoogleAuthProvider.getCredential(idToken, accessToken);
        pendingResolver = null;
        FirebaseAuth.getInstance()
            .signInWithCredential(credential)
            .addOnCompleteListener(getActivity(), task -> handleSignInResult(call, task));
    }

    @PluginMethod
    public void signInWithGoogle(PluginCall call) {
        call.reject("Google authorization must be started by the Firebase Authentication plugin.", "auth/operation-not-supported");
    }

    @PluginMethod
    public void signInWithApple(PluginCall call) {
        pendingResolver = null;
        FirebaseAuth auth = FirebaseAuth.getInstance();
        Task<AuthResult> pendingResult = auth.getPendingAuthResult();
        if (pendingResult != null) {
            pendingResult.addOnCompleteListener(getActivity(), task -> handleSignInResult(call, task));
            return;
        }

        OAuthProvider.Builder provider = OAuthProvider.newBuilder("apple.com");
        provider.setScopes(Arrays.asList("email", "name"));
        auth.startActivityForSignInWithProvider(getActivity(), provider.build())
            .addOnCompleteListener(getActivity(), task -> handleSignInResult(call, task));
    }

    @PluginMethod
    public void resolveTotpSignIn(PluginCall call) {
        String code = call.getString("code");
        if (code == null || !code.matches("\\d{6}")) {
            call.reject("A 6-digit verification code is required.", "auth/invalid-verification-code");
            return;
        }

        MultiFactorResolver resolver = pendingResolver;
        if (resolver == null) {
            call.reject(
                "The multi-factor sign-in challenge is no longer available.",
                "auth/multi-factor-challenge-missing"
            );
            return;
        }

        MultiFactorInfo hint = findTotpHint(resolver);
        if (hint == null) {
            call.reject(
                "No authenticator app is enrolled for this account.",
                "auth/unsupported-second-factor"
            );
            return;
        }

        resolver
            .resolveSignIn(TotpMultiFactorGenerator.getAssertionForSignIn(hint.getUid(), code))
            .addOnCompleteListener(getActivity(), task -> {
                if (task.isSuccessful()) {
                    pendingResolver = null;
                    call.resolve();
                    return;
                }

                reject(call, task.getException());
            });
    }

    @PluginMethod
    public void cancelSignIn(PluginCall call) {
        pendingResolver = null;
        call.resolve();
    }

    private void handleSignInResult(PluginCall call, Task<AuthResult> task) {
        if (task.isSuccessful()) {
            JSObject result = new JSObject();
            result.put("mfaRequired", false);
            call.resolve(result);
            return;
        }

        Exception exception = task.getException();
        if (exception instanceof FirebaseAuthMultiFactorException) {
            MultiFactorResolver resolver = ((FirebaseAuthMultiFactorException) exception).getResolver();
            if (findTotpHint(resolver) == null) {
                call.reject(
                    "No authenticator app is enrolled for this account.",
                    "auth/unsupported-second-factor"
                );
                return;
            }

            pendingResolver = resolver;
            JSObject result = new JSObject();
            result.put("mfaRequired", true);
            call.resolve(result);
            return;
        }

        reject(call, exception);
    }

    private MultiFactorInfo findTotpHint(MultiFactorResolver resolver) {
        for (MultiFactorInfo hint : resolver.getHints()) {
            if (TotpMultiFactorGenerator.FACTOR_ID.equals(hint.getFactorId())) {
                return hint;
            }
        }
        return null;
    }

    private void reject(PluginCall call, Exception exception) {
        String message = exception == null || exception.getMessage() == null
            ? "Firebase authentication failed."
            : exception.getMessage();
        String code = null;
        if (exception instanceof FirebaseAuthException) {
            String firebaseCode = ((FirebaseAuthException) exception).getErrorCode();
            code = "auth/" + firebaseCode
                .replaceFirst("^ERROR_", "")
                .toLowerCase(Locale.ROOT)
                .replace('_', '-');
        }

        if (code == null) {
            call.reject(message);
        } else {
            call.reject(message, code);
        }
    }
}

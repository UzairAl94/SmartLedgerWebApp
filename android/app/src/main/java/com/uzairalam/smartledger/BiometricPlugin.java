package com.uzairalam.smartledger;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Thin wrapper over Android's BiometricPrompt so the lock screen can offer a
 * fingerprint unlock. The PIN remains the primary factor and is still required
 * to change security settings.
 */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        int status = BiometricManager.from(getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("reason", reasonFor(status));
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("App is not available");
            return;
        }
        if (!(activity instanceof FragmentActivity)) {
            call.reject("This screen cannot host a biometric prompt");
            return;
        }

        final FragmentActivity fragmentActivity = (FragmentActivity) activity;
        Executor executor = ContextCompat.getMainExecutor(getContext());

        BiometricPrompt prompt = new BiometricPrompt(
            fragmentActivity,
            executor,
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    JSObject payload = new JSObject();
                    payload.put("success", true);
                    call.resolve(payload);
                }

                @Override
                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                    call.reject(errString.toString(), String.valueOf(errorCode));
                }
            }
        );

        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(call.getString("title", "Unlock Smart Ledger"))
            .setSubtitle(call.getString("subtitle", "Confirm your fingerprint"))
            .setNegativeButtonText("Use PIN")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            .build();

        fragmentActivity.runOnUiThread(() -> prompt.authenticate(info));
    }

    private String reasonFor(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return "ready";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "This device has no biometric hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "Biometric hardware is unavailable right now";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "No fingerprint is enrolled on this device";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "A security update is required";
            default:
                return "Biometrics are not available";
        }
    }
}

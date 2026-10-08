import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/AuthContext";
import { useAppConfig } from "@/src/appConfig";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function Register() {
  const { signUp } = useAuth();
  const { welcome_credit } = useAppConfig();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (username.trim().length < 3) return "Username must be at least 3 characters.";
    if (!/^[a-zA-Z0-9_\.]+$/.test(username.trim()))
      return "Username may only contain letters, numbers, underscore or dot.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords do not match.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Please enter a valid email address.";
    return null;
  };

  const submit = async () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      await signUp({
        username,
        password,
        name: name || username,
        email: email || undefined,
      });
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message || "Unable to create account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.top}>
          <Pressable testID="register-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Text style={styles.topTitle}>Create account</Text>
          <View style={{ width: 42 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>JOIN ELITERESERVE</Text>
          <Text style={styles.headline}>Drive the city&apos;s finest.</Text>
          <Text style={styles.subline}>
            An EliteReserve membership unlocks request-to-book with verified hosts and premium support
            {welcome_credit > 0
              ? `, plus a $${welcome_credit.toLocaleString("en-AU")} demo wallet credit.`
              : "."}
          </Text>

          <Field
            testID="reg-username"
            label="USERNAME *"
            placeholder="e.g. melbourne_driver"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            icon="person-outline"
          />
          <Field
            testID="reg-name"
            label="DISPLAY NAME"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            icon="card-outline"
          />
          <Field
            testID="reg-email"
            label="EMAIL (OPTIONAL)"
            placeholder="you@email.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            icon="mail-outline"
          />
          <Field
            testID="reg-password"
            label="PASSWORD *"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            icon="lock-closed-outline"
            trailing={
              <Pressable testID="reg-toggle-pw" onPress={() => setShowPw((p) => !p)} hitSlop={10}>
                <Ionicons
                  name={showPw ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            }
          />
          <Field
            testID="reg-confirm"
            label="CONFIRM PASSWORD *"
            placeholder="Re-enter password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showPw}
            icon="lock-closed-outline"
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            testID="reg-submit"
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [styles.cta, (pressed || submitting) && { opacity: 0.92 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.ctaText}>Create account</Text>
                <Ionicons name="arrow-forward" size={16} color="#000" />
              </>
            )}
          </Pressable>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>Already a member?</Text>
            <Link href="/login" asChild>
              <Pressable testID="reg-goto-login">
                <Text style={styles.bottomLink}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  icon,
  trailing,
  ...props
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name={icon} size={16} color={colors.textMuted} />
        <TextInput {...props} placeholderTextColor={colors.textMuted} style={styles.input} />
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium },
  scroll: { padding: spacing.lg, paddingBottom: 80 },
  eyebrow: { color: colors.primary, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  headline: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -0.4,
    marginTop: 4,
  },
  subline: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: fonts.bodyBold,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  input: { flex: 1, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 15 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,107,107,0.08)",
    borderColor: "rgba(255,107,107,0.3)",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.error, fontFamily: fonts.body, fontSize: 12, flex: 1 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.full,
  },
  ctaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 0.5 },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.lg,
  },
  bottomText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 },
  bottomLink: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 13 },
});

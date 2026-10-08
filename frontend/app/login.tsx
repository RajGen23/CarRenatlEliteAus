import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Animated,
  Easing,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useAppConfig } from "@/src/appConfig";
import { useAuth } from "@/src/AuthContext";
import { Screen } from "@/src/components/Screen";
import { colors, fonts, radius, spacing } from "@/src/theme";

const LOGO_SOURCE = require("../assets/images/logo.png");

const LOGO_SIZE = 110;

export default function Login() {
  const { user, signIn } = useAuth();
  const { demo_mode } = useAppConfig();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fade = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(24)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const scaleEmblem = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.spring(scaleEmblem, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [fade, slideUp, glow, scaleEmblem]);

  useEffect(() => {
    if (user) {
      if (user.role === "admin") router.replace("/admin/dashboard");
      else if (user.is_vendor) router.replace("/(vendor)/dashboard");
      else router.replace("/(tabs)/home");
    }
  }, [user]);

  const handleLogin = async () => {
    setError(null);
    if (!identifier.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(identifier, password);
    } catch (e: any) {
      setError(e?.message || "Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  };

  const ringGlow = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] });

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Image
          source={require("../assets/images/app-image.png")}
          style={styles.bg}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.85)", "#000"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[styles.brandWrap, { opacity: fade, transform: [{ scale: scaleEmblem }] }]}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.ringGlow, { opacity: ringGlow }]}
            />
            <Image source={LOGO_SOURCE} style={styles.logo} />
            <Text style={styles.brandTitle}>EliteReserve</Text>
            <Text style={styles.brandSub}>Melbourne&apos;s elite fleet, at your fingertips.</Text>
          </Animated.View>

          <Animated.View style={[styles.card, { opacity: fade, transform: [{ translateY: slideUp }] }]}>
            <Text style={styles.cardEyebrow}>WELCOME BACK</Text>
            <Text style={styles.cardTitle}>Sign in to EliteReserve</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>USERNAME OR EMAIL</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                <TextInput
                  testID="login-identifier"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="userdemo"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <TextInput
                  testID="login-password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <Pressable testID="login-toggle-pw" onPress={() => setShowPw((p) => !p)} hitSlop={10}>
                  <Ionicons
                    name={showPw ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="login-submit"
              onPress={handleLogin}
              disabled={submitting}
              style={({ pressed }) => [
                styles.cta,
                (pressed || submitting) && { opacity: 0.92, transform: [{ scale: 0.98 }] },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={styles.ctaText}>Sign in</Text>
                  <Ionicons name="arrow-forward" size={16} color="#000" />
                </>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>NEW TO ELITERESERVE</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable testID="login-goto-register" onPress={() => router.push("/register")} style={styles.outlineBtn}>
              <Ionicons name="person-add-outline" size={15} color={colors.primary} />
              <Text style={styles.outlineBtnText}>Create an account</Text>
            </Pressable>

            {demo_mode ? (
              <View style={styles.demoCard}>
                <Text style={styles.demoTitle}>DEMO ACCOUNTS</Text>
                <DemoRow icon="car-sport-outline" label="Renter" creds="userdemo · User@123" />
                <DemoRow icon="business-outline" label="Host" creds="vendordemo · Vendor@123" />
              </View>
            ) : null}

            <Text style={styles.legal}>
              By continuing you accept the Members&apos; Terms &amp; Privacy Policy.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function DemoRow({
  icon,
  label,
  creds,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  creds: string;
}) {
  return (
    <View style={styles.demoRow}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={styles.demoLabel}>{label}</Text>
      <Text style={styles.demoCreds}>{creds}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  brandWrap: { alignItems: "center", marginTop: spacing.lg, position: "relative" },
  ringGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(212,175,55,0.18)",
    top: -45,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  brandTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: -0.5,
    marginTop: -6,
  },
  brandSub: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  card: {
    marginTop: spacing.xl,
    backgroundColor: "rgba(20,20,20,0.85)",
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  cardEyebrow: {
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: fonts.bodyBold,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.4,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  inputGroup: { marginBottom: spacing.md },
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
    marginBottom: spacing.sm,
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
    marginTop: spacing.sm,
  },
  ctaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 0.5 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  outlineBtnText: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.8 },
  demoCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: "rgba(212,175,55,0.05)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  demoTitle: {
    color: colors.primary,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: fonts.bodyBold,
    marginBottom: 8,
  },
  demoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 3 },
  demoLabel: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 11, width: 50 },
  demoCreds: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, flex: 1 },
  legal: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.body,
    textAlign: "center",
    marginTop: spacing.md,
  },
});

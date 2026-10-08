import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Form = {
  company: string;
  phone: string;
  abn: string;
  license_no: string;
  bank_account_name: string;
  bank_bsb: string;
  bank_account_no: string;
};

const STEPS = ["Company", "Identity", "Payouts"] as const;

export default function VendorOnboarding() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Form>({
    company: "",
    phone: "",
    abn: "",
    license_no: "",
    bank_account_name: "",
    bank_bsb: "",
    bank_account_no: "",
  });

  const set = (k: keyof Form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const next = async () => {
    if (step === 0 && (!form.company || !form.phone)) return Alert.alert("Required", "Company and phone are required.");
    if (step === 1 && !form.license_no) return Alert.alert("Required", "Driver license number is required.");
    if (step < 2) return setStep(step + 1);
    if (!form.bank_account_name || !form.bank_bsb || !form.bank_account_no) {
      return Alert.alert("Required", "All bank fields are required for payouts.");
    }
    setSubmitting(true);
    try {
      await api.post("/vendor/onboard", form);
      router.replace("/(vendor)/dashboard");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable testID="onboard-back" onPress={() => (step === 0 ? router.back() : setStep(step - 1))} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>BECOME A HOST</Text>
          <Text style={styles.topTitle}>{STEPS[step]}</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <View style={styles.stepper}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        {step === 0 && (
          <View style={styles.formBlock}>
            <Text style={styles.hero}>Tell us about your{"\n"}<Text style={styles.heroAccent}>business</Text>.</Text>
            <Text style={styles.sub}>Required to issue invoices and route payouts.</Text>
            <Field label="COMPANY NAME *" value={form.company} onChangeText={(v) => set("company", v)} placeholder="LuxFleet Pty Ltd" testID="f-company" />
            <Field label="CONTACT PHONE *" value={form.phone} onChangeText={(v) => set("phone", v)} placeholder="+61 4XX XXX XXX" keyboardType="phone-pad" testID="f-phone" />
            <Field label="ABN (optional)" value={form.abn} onChangeText={(v) => set("abn", v)} placeholder="11 222 333 444" testID="f-abn" />
          </View>
        )}
        {step === 1 && (
          <View style={styles.formBlock}>
            <Text style={styles.hero}>Verify your{"\n"}<Text style={styles.heroAccent}>identity</Text>.</Text>
            <Text style={styles.sub}>Our team reviews your details before your host account is verified.</Text>
            <Field label="DRIVER LICENCE NO *" value={form.license_no} onChangeText={(v) => set("license_no", v)} placeholder="0123 4567" testID="f-license" />
            <View style={styles.uploadCard}>
              <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.uploadTitle}>Drivers licence photo</Text>
                <Text style={styles.uploadSub}>Optional · used for live verification</Text>
              </View>
              <View style={styles.uploadBadge}><Text style={styles.uploadBadgeText}>SKIP</Text></View>
            </View>
            <View style={styles.uploadCard}>
              <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.uploadTitle}>Government ID</Text>
                <Text style={styles.uploadSub}>Optional · passport / proof of address</Text>
              </View>
              <View style={styles.uploadBadge}><Text style={styles.uploadBadgeText}>SKIP</Text></View>
            </View>
          </View>
        )}
        {step === 2 && (
          <View style={styles.formBlock}>
            <Text style={styles.hero}>Get paid <Text style={styles.heroAccent}>fast</Text>.</Text>
            <Text style={styles.sub}>Earnings settle to this Australian bank account.</Text>
            <Field label="ACCOUNT HOLDER *" value={form.bank_account_name} onChangeText={(v) => set("bank_account_name", v)} placeholder="As on bank statement" testID="f-bank-name" />
            <Field label="BSB *" value={form.bank_bsb} onChangeText={(v) => set("bank_bsb", v)} placeholder="063-000" keyboardType="number-pad" testID="f-bsb" />
            <Field label="ACCOUNT NUMBER *" value={form.bank_account_no} onChangeText={(v) => set("bank_account_no", v)} placeholder="0000 0000" keyboardType="number-pad" testID="f-acct" />
            <View style={styles.note}>
              <Ionicons name="lock-closed" size={12} color={colors.primary} />
              <Text style={styles.noteText}>Bank details are encrypted at rest. Demo mode does not store real funds.</Text>
            </View>
          </View>
        )}

        <Pressable
          testID="onboard-next"
          onPress={next}
          disabled={submitting}
          style={({ pressed }) => [styles.cta, (pressed || submitting) && { opacity: 0.9 }]}
        >
          {submitting ? <ActivityIndicator color="#000" /> : (
            <>
              <Text style={styles.ctaText}>{step < 2 ? "Continue" : "Finish & open dashboard"}</Text>
              <Ionicons name="arrow-forward" size={14} color="#000" />
            </>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.textMuted} style={styles.fInput} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  stepper: { flexDirection: "row", gap: 6, justifyContent: "center", paddingTop: spacing.md },
  stepDot: { width: 36, height: 3, borderRadius: 2, backgroundColor: colors.border },
  stepDotActive: { backgroundColor: colors.primary },
  formBlock: { gap: spacing.sm },
  hero: { color: colors.textPrimary, fontSize: 32, lineHeight: 38, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: spacing.md },
  heroAccent: { color: colors.primary, fontStyle: "italic" },
  sub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, marginBottom: spacing.lg, lineHeight: 20 },
  fLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold, marginBottom: 8 },
  fInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 14, borderRadius: radius.md,
    color: colors.textPrimary, fontFamily: fonts.body, fontSize: 15,
  },
  uploadCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.sm,
  },
  uploadTitle: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  uploadSub: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 2 },
  uploadBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  uploadBadgeText: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  note: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: spacing.md, backgroundColor: "rgba(212,175,55,0.05)",
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md,
  },
  noteText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 16 },
  cta: {
    backgroundColor: colors.primary, paddingVertical: 18,
    borderRadius: radius.full, marginTop: spacing.xl,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
  },
  ctaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
});

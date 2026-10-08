import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, fonts, radius, spacing } from "@/src/theme";

type VendorMe = {
  is_vendor: boolean;
  vendor_profile: {
    company: string;
    phone: string;
    abn?: string | null;
    license_no: string;
    bank_account_name: string;
    bank_bsb: string;
    bank_account_no: string;
    kyc_status?: string;
    onboarded_at?: string;
  } | null;
};

export default function VendorProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company: "",
    phone: "",
    abn: "",
    bank_account_name: "",
    bank_bsb: "",
    bank_account_no: "",
  });
  const [kyc, setKyc] = useState<string>("pending");

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<VendorMe>("/vendor/me");
        const p = me.vendor_profile;
        if (p) {
          setForm({
            company: p.company || "",
            phone: p.phone || "",
            abn: p.abn || "",
            bank_account_name: p.bank_account_name || "",
            bank_bsb: p.bank_bsb || "",
            bank_account_no: p.bank_account_no || "",
          });
          setKyc(p.kyc_status || "pending");
        }
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.company || !form.phone) return Alert.alert("Required", "Company and phone are required.");
    setSaving(true);
    try {
      await api.patch("/vendor/profile", form);
      Alert.alert("Saved", "Your host profile has been updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable testID="profile-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>HOST PROFILE</Text>
          <Text style={styles.topTitle}>Company &amp; payouts</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={styles.kycCard}>
          <View style={styles.kycRow}>
            <View style={[styles.kycIcon, kyc === "approved" && styles.kycIconOk]}>
              <Ionicons name={kyc === "approved" ? "shield-checkmark" : "shield-outline"} size={18} color={kyc === "approved" ? colors.success : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kycLabel}>KYC STATUS</Text>
              <Text style={styles.kycValue}>{kyc.toUpperCase()}</Text>
            </View>
            <View style={styles.identBadge}>
              <Text style={styles.identBadgeText}>{user?.email}</Text>
            </View>
          </View>
        </View>

        <Section title="COMPANY">
          <Field label="COMPANY NAME *" value={form.company} onChangeText={(v) => set("company", v)} placeholder="LuxFleet Pty Ltd" testID="vp-company" />
          <Field label="PHONE *" value={form.phone} onChangeText={(v) => set("phone", v)} placeholder="+61 4XX XXX XXX" keyboardType="phone-pad" testID="vp-phone" />
          <Field label="ABN" value={form.abn} onChangeText={(v) => set("abn", v)} placeholder="11 222 333 444" testID="vp-abn" />
        </Section>

        <Section title="BANK · PAYOUTS">
          <Field label="ACCOUNT HOLDER" value={form.bank_account_name} onChangeText={(v) => set("bank_account_name", v)} placeholder="As on bank statement" testID="vp-bank-name" />
          <Field label="BSB" value={form.bank_bsb} onChangeText={(v) => set("bank_bsb", v)} placeholder="063-000" keyboardType="number-pad" testID="vp-bsb" />
          <Field label="ACCOUNT NUMBER" value={form.bank_account_no} onChangeText={(v) => set("bank_account_no", v)} placeholder="0000 0000" keyboardType="number-pad" testID="vp-acct" />
          <View style={styles.note}>
            <Ionicons name="lock-closed" size={12} color={colors.primary} />
            <Text style={styles.noteText}>Bank details are encrypted at rest. Demo mode does not store real funds.</Text>
          </View>
        </Section>

        <Pressable
          testID="vp-save"
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.cta, (pressed || saving) && { opacity: 0.9 }]}
        >
          {saving ? <ActivityIndicator color="#000" /> : (
            <>
              <Text style={styles.ctaText}>Save changes</Text>
              <Ionicons name="checkmark" size={16} color="#000" />
            </>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  kycCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.lg },
  kycRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  kycIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.05)" },
  kycIconOk: { borderColor: "rgba(124,227,166,0.4)", backgroundColor: "rgba(124,227,166,0.08)" },
  kycLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  kycValue: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.displayMedium, letterSpacing: 1, marginTop: 2 },
  identBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, maxWidth: 130 },
  identBadgeText: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.body },
  sectionTitle: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold, marginBottom: spacing.sm },
  fLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold, marginBottom: 6 },
  fInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 14, borderRadius: radius.md, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 15 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, backgroundColor: "rgba(212,175,55,0.05)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.sm },
  noteText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 16 },
  cta: { backgroundColor: colors.primary, paddingVertical: 18, borderRadius: radius.full, marginTop: spacing.lg, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  ctaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
});

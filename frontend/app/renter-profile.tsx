import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { notify } from "@/src/utils/dialog";
import type { RenterProfile } from "@/src/types";

const EMPTY: RenterProfile = {
  full_name: "",
  phone: "",
  dob: "",
  address_line1: "",
  city: "",
  state: "",
  postcode: "",
  license_no: "",
  license_expiry: "",
};

export default function RenterProfileScreen() {
  const [form, setForm] = useState<RenterProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ profile: RenterProfile | null }>("/profile/renter");
        if (res.profile) setForm({ ...EMPTY, ...res.profile });
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k: keyof RenterProfile, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    const missing = (Object.keys(EMPTY) as (keyof RenterProfile)[]).filter(
      (k) => !String(form[k] ?? "").trim()
    );
    if (missing.length) {
      notify("Missing details", "Please fill every field — hosts review this before approving a trip.");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/profile/renter", form);
      notify("Profile saved", "Hosts will now see your verified details with each request.");
      router.back();
    } catch (e: any) {
      notify("Could not save", e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable testID="renter-profile-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>RENTER VERIFICATION</Text>
          <Text style={styles.topTitle}>Your details</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.note}>
          <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
          <Text style={styles.noteText}>
            Hosts see these details when reviewing your request. Accurate info gets approved faster.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>IDENTITY</Text>
        <Field label="FULL NAME (AS ON LICENCE)" value={form.full_name} onChangeText={(v) => set("full_name", v)} placeholder="Alexander Whitmore" testID="rp-name" />
        <Field label="PHONE" value={form.phone} onChangeText={(v) => set("phone", v)} placeholder="+61 4XX XXX XXX" keyboardType="phone-pad" testID="rp-phone" />
        <Field label="DATE OF BIRTH (YYYY-MM-DD)" value={form.dob} onChangeText={(v) => set("dob", v)} placeholder="1992-04-18" testID="rp-dob" />

        <Text style={styles.sectionTitle}>RESIDENTIAL ADDRESS</Text>
        <Field label="STREET ADDRESS" value={form.address_line1} onChangeText={(v) => set("address_line1", v)} placeholder="18 Southbank Blvd" testID="rp-address" />
        <Field label="CITY / SUBURB" value={form.city} onChangeText={(v) => set("city", v)} placeholder="Melbourne" testID="rp-city" />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="STATE" value={form.state} onChangeText={(v) => set("state", v.toUpperCase())} placeholder="VIC" testID="rp-state" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="POSTCODE" value={form.postcode} onChangeText={(v) => set("postcode", v)} placeholder="3006" keyboardType="number-pad" testID="rp-postcode" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>DRIVER LICENCE</Text>
        <Field label="LICENCE NUMBER" value={form.license_no} onChangeText={(v) => set("license_no", v)} placeholder="VIC-DL-556231" testID="rp-license" />
        <Field label="EXPIRY (YYYY-MM-DD)" value={form.license_expiry} onChangeText={(v) => set("license_expiry", v)} placeholder="2029-04-18" testID="rp-license-expiry" />

        <Pressable
          testID="rp-save"
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.cta, (pressed || saving) && { opacity: 0.9 }]}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.ctaText}>Save details</Text>
              <Ionicons name="checkmark" size={16} color="#000" />
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  eyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    backgroundColor: "rgba(212,175,55,0.05)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  noteText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 16 },
  sectionTitle: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold, marginBottom: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  fLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold, marginBottom: 6 },
  fInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  cta: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  ctaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
});

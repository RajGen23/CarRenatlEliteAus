import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

const CATEGORIES = ["Sports", "Luxury", "SUV", "Sedan"] as const;
const FUELS = ["Petrol", "Electric", "Hybrid", "Diesel"];
const TRANSMISSIONS = ["Automatic", "Manual"];

const DEFAULT_IMG = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&q=80";

export default function VendorCarForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    category: "Luxury" as (typeof CATEGORIES)[number],
    price_per_day: "",
    weekly_price: "",
    security_deposit: "",
    promo_pct: "",
    fuel_type: "Petrol",
    transmission: "Automatic",
    seats: "4",
    image: DEFAULT_IMG,
    description: "",
    horsepower: "",
    top_speed: "",
    acceleration: "",
    registration_no: "",
    year: "",
    available: true,
  });

  useEffect(() => {
    if (!editing) return;
    api.get<any>(`/cars/${id}`).then((c) => {
      setForm({
        brand: c.brand,
        model: c.model,
        category: c.category,
        price_per_day: String(c.price_per_day),
        weekly_price: String(c.weekly_price ?? ""),
        security_deposit: String(c.security_deposit ?? ""),
        promo_pct: String(c.promo_pct ?? ""),
        fuel_type: c.fuel_type,
        transmission: c.transmission,
        seats: String(c.seats),
        image: c.image,
        description: c.description,
        horsepower: String(c.horsepower ?? ""),
        top_speed: String(c.top_speed ?? ""),
        acceleration: c.acceleration ?? "",
        registration_no: c.registration_no ?? "",
        year: String(c.year ?? ""),
        available: c.available,
      });
    }).catch(() => {});
  }, [editing, id]);

  const set = (k: keyof typeof form, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.brand || !form.model || !form.price_per_day) {
      return Alert.alert("Required", "Brand, model and daily price are required.");
    }
    setSubmitting(true);
    try {
      const payload = {
        brand: form.brand,
        model: form.model,
        category: form.category,
        price_per_day: parseFloat(form.price_per_day),
        weekly_price: form.weekly_price ? parseFloat(form.weekly_price) : null,
        security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : 0,
        promo_pct: form.promo_pct ? parseFloat(form.promo_pct) : null,
        fuel_type: form.fuel_type,
        transmission: form.transmission,
        seats: parseInt(form.seats || "4", 10),
        image: form.image,
        gallery: [form.image],
        features: [],
        description: form.description,
        horsepower: parseInt(form.horsepower || "0", 10),
        top_speed: parseInt(form.top_speed || "0", 10),
        acceleration: form.acceleration,
        registration_no: form.registration_no,
        year: form.year ? parseInt(form.year, 10) : null,
        available: form.available,
      };
      if (editing) {
        await api.patch(`/vendor/cars/${id}`, payload);
      } else {
        await api.post("/vendor/cars", payload);
      }
      router.replace("/(vendor)/fleet");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable testID="form-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>{editing ? "EDIT" : "NEW VEHICLE"}</Text>
          <Text style={styles.topTitle}>{editing ? "Update details" : "List your car"}</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <Section title="VEHICLE">
          <Row>
            <Field label="BRAND *" value={form.brand} onChangeText={(v) => set("brand", v)} placeholder="Lamborghini" testID="f-brand" />
            <Field label="MODEL *" value={form.model} onChangeText={(v) => set("model", v)} placeholder="Huracán EVO" testID="f-model" />
          </Row>
          <Row>
            <Field label="YEAR" value={form.year} onChangeText={(v) => set("year", v)} placeholder="2024" keyboardType="number-pad" testID="f-year" />
            <Field label="REGO #" value={form.registration_no} onChangeText={(v) => set("registration_no", v)} placeholder="ABC123" testID="f-rego" />
          </Row>

          <Text style={styles.fLabel}>CATEGORY</Text>
          <View style={styles.pills}>
            {CATEGORIES.map((c) => {
              const a = form.category === c;
              return (
                <Pressable key={c} testID={`f-cat-${c}`} onPress={() => set("category", c)} style={[styles.pill, a && styles.pillActive]}>
                  <Text style={[styles.pillText, a && styles.pillTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="SPECS">
          <Row>
            <Field label="FUEL" value={form.fuel_type} onChangeText={(v) => set("fuel_type", v)} placeholder="Petrol" suggestions={FUELS} testID="f-fuel" />
            <Field label="GEARBOX" value={form.transmission} onChangeText={(v) => set("transmission", v)} placeholder="Automatic" suggestions={TRANSMISSIONS} testID="f-trans" />
          </Row>
          <Row>
            <Field label="SEATS" value={form.seats} onChangeText={(v) => set("seats", v)} placeholder="4" keyboardType="number-pad" testID="f-seats" />
            <Field label="HP" value={form.horsepower} onChangeText={(v) => set("horsepower", v)} placeholder="640" keyboardType="number-pad" testID="f-hp" />
          </Row>
          <Row>
            <Field label="TOP SPEED km/h" value={form.top_speed} onChangeText={(v) => set("top_speed", v)} placeholder="330" keyboardType="number-pad" testID="f-top" />
            <Field label="0-100" value={form.acceleration} onChangeText={(v) => set("acceleration", v)} placeholder="2.9s" testID="f-acc" />
          </Row>
        </Section>

        <Section title="PRICING">
          <Row>
            <Field label="DAILY $ *" value={form.price_per_day} onChangeText={(v) => set("price_per_day", v)} placeholder="800" keyboardType="decimal-pad" testID="f-price" />
            <Field label="WEEKLY $" value={form.weekly_price} onChangeText={(v) => set("weekly_price", v)} placeholder="4800" keyboardType="decimal-pad" testID="f-weekly" />
          </Row>
          <Row>
            <Field label="DEPOSIT $" value={form.security_deposit} onChangeText={(v) => set("security_deposit", v)} placeholder="1000" keyboardType="decimal-pad" testID="f-dep" />
            <Field label="PROMO % OFF" value={form.promo_pct} onChangeText={(v) => set("promo_pct", v)} placeholder="10" keyboardType="number-pad" testID="f-promo" />
          </Row>
        </Section>

        <Section title="MEDIA">
          <Field label="HERO IMAGE URL" value={form.image} onChangeText={(v) => set("image", v)} placeholder="https://..." testID="f-image" />
          <View style={styles.imagePreview}>
            {form.image ? <Text style={styles.previewHint}>Preview</Text> : null}
          </View>
          <View style={styles.uploadCard}>
            <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.uploadTitle}>Insurance & registration docs</Text>
              <Text style={styles.uploadSub}>Optional · 256-bit encrypted</Text>
            </View>
            <View style={styles.uploadBadge}><Text style={styles.uploadBadgeText}>SKIP</Text></View>
          </View>
        </Section>

        <Section title="DESCRIPTION">
          <TextInput
            testID="f-desc"
            value={form.description}
            onChangeText={(v) => set("description", v)}
            placeholder="Describe what makes this car special..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            style={[styles.fInput, { minHeight: 100, textAlignVertical: "top" }]}
          />
        </Section>

        <Pressable
          testID="vehicle-submit"
          onPress={submit}
          disabled={submitting}
          style={({ pressed }) => [styles.cta, (pressed || submitting) && { opacity: 0.9 }]}
        >
          {submitting ? <ActivityIndicator color="#000" /> : (
            <>
              <Text style={styles.ctaText}>{editing ? "Save changes" : "List vehicle"}</Text>
              <Ionicons name="arrow-forward" size={14} color="#000" />
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

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", gap: spacing.sm }}>{children}</View>;
}

function Field({ label, suggestions, ...props }: { label: string; suggestions?: string[] } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ flex: 1, marginBottom: spacing.sm }}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.textMuted} style={styles.fInput} />
      {suggestions && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable key={s} onPress={() => props.onChangeText?.(s)} style={styles.sugChip}>
              <Text style={styles.sugText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  sectionTitle: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold, marginBottom: spacing.sm },
  fLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold, marginBottom: 6 },
  fInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md,
    color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14,
  },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  sugChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  sugText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 12 },
  pillTextActive: { color: "#000" },
  imagePreview: { height: 80, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.sm, alignItems: "center", justifyContent: "center" },
  previewHint: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.bodyMedium },
  uploadCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.sm,
  },
  uploadTitle: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  uploadSub: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 2 },
  uploadBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  uploadBadgeText: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  cta: { backgroundColor: colors.primary, paddingVertical: 18, borderRadius: radius.full, marginTop: spacing.lg, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  ctaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
});

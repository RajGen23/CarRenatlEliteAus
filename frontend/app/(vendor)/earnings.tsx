import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Revenue = {
  gross: number;
  commission: number;
  tax: number;
  paid_out: number;
  available: number;
  invoices: { invoice_id: string; booking_id: string; date: string; gross: number; commission: number; net: number }[];
  payouts: { payout_id: string; amount: number; status: string; requested_at: string; bank_last4: string }[];
};

export default function VendorEarnings() {
  const [data, setData] = useState<Revenue | null>(null);
  const [amount, setAmount] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Revenue>("/vendor/revenue");
      setData(d);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requestPayout = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert("Enter amount", "Enter a positive amount");
    if (data && amt > data.available) return Alert.alert("Too high", `Max available: $${data.available.toFixed(2)}`);
    setSubmitting(true);
    try {
      await api.post("/vendor/payouts", { amount: amt });
      setAmount("");
      await load();
      Alert.alert("Payout requested", "We'll transfer to your bank within 1–2 business days.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>FINANCE</Text>
        <Text style={styles.title}>Earnings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      >
        <View style={styles.bal}>
          <Text style={styles.balLabel}>AVAILABLE FOR PAYOUT</Text>
          <Text style={styles.balAmount}>${(data?.available ?? 0).toFixed(2)}</Text>
          <View style={styles.balGrid}>
            <Stat label="GROSS" value={`$${(data?.gross ?? 0).toFixed(0)}`} />
            <Stat label="FEES" value={`$${(data?.commission ?? 0).toFixed(0)}`} muted />
            <Stat label="GST" value={`$${(data?.tax ?? 0).toFixed(0)}`} muted />
            <Stat label="PAID OUT" value={`$${(data?.paid_out ?? 0).toFixed(0)}`} muted />
          </View>
        </View>

        <View style={styles.withdraw}>
          <Text style={styles.sectionTitle}>Request a payout</Text>
          <Text style={styles.sectionSub}>Funds arrive 1–2 business days · transferred to your saved bank.</Text>
          <View style={styles.withdrawRow}>
            <View style={styles.amountWrap}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                testID="payout-amount"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
            </View>
            <Pressable
              testID="request-payout"
              onPress={requestPayout}
              disabled={submitting}
              style={({ pressed }) => [styles.requestBtn, (pressed || submitting) && { opacity: 0.85 }]}
            >
              <Text style={styles.requestText}>{submitting ? "..." : "Request"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout history</Text>
          {(data?.payouts ?? []).length === 0 ? (
            <Text style={styles.empty}>No payouts yet.</Text>
          ) : (
            data?.payouts.map((p) => (
              <View key={p.payout_id} style={styles.payoutRow} testID={`payout-${p.payout_id}`}>
                <View style={styles.payoutIcon}>
                  <Ionicons name="arrow-down-outline" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutTitle}>${p.amount.toFixed(2)} to ····{p.bank_last4}</Text>
                  <Text style={styles.payoutSub}>{new Date(p.requested_at).toLocaleDateString("en-AU")}</Text>
                </View>
                <Text style={styles.payoutStatus}>{p.status}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoices</Text>
          {(data?.invoices ?? []).length === 0 ? (
            <Text style={styles.empty}>No invoices yet — complete a booking to see one here.</Text>
          ) : (
            data?.invoices.map((inv) => (
              <View key={inv.invoice_id} style={styles.invRow} testID={`inv-${inv.invoice_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invId}>{inv.invoice_id}</Text>
                  <Text style={styles.invDate}>{new Date(inv.date).toLocaleDateString("en-AU")}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.invNet}>${inv.net.toFixed(2)}</Text>
                  <Text style={styles.invGross}>gross ${inv.gross.toFixed(2)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, muted && { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  bal: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
  },
  balLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  balAmount: { color: colors.textPrimary, fontSize: 42, fontFamily: fonts.display, letterSpacing: -1, marginTop: 4 },
  balGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  statLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  statValue: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, marginTop: 4 },
  withdraw: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
  withdrawRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  amountWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    height: 52,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  dollar: { color: colors.textMuted, fontSize: 18, fontFamily: fonts.display, marginRight: 4 },
  amountInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 18 },
  requestBtn: { paddingHorizontal: 24, justifyContent: "center", backgroundColor: colors.primary, borderRadius: radius.full },
  requestText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium },
  sectionSub: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginTop: 4 },
  payoutRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border,
  },
  payoutIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  payoutTitle: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  payoutSub: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 2 },
  payoutStatus: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  invRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  invId: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  invDate: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  invNet: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 14 },
  invGross: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  empty: { color: colors.textMuted, fontFamily: fonts.body, marginTop: spacing.md },
});

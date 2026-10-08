import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Finance = {
  summary: {
    gross_revenue: number; platform_commission: number; vendor_payouts: number;
    payouts_due_now: number; tax_collected: number; gst_on_commission: number;
  };
  monthly: { label: string; gross: number; commission: number; payouts: number; tax: number }[];
  payouts: { vendor_id: string; vendor_name: string; bookings: number; gross: number; commission: number; due_now: number; pending: number }[];
};

const money = (n: number) => `$${(n ?? 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

export default function AdminFinance() {
  const [data, setData] = useState<Finance | null>(null);
  const load = useCallback(async () => { setData(await api.get<Finance>("/admin/finance")); }, []);
  useEffect(() => { load(); }, [load]);

  const sm = data?.summary;
  const cards = [
    { key: "gross", label: "GROSS REVENUE", value: sm ? money(sm.gross_revenue) : "—", icon: "cash-outline" as const, hint: "All confirmed bookings" },
    { key: "commission", label: "COMMISSION (15%)", value: sm ? money(sm.platform_commission) : "—", icon: "pie-chart-outline" as const, hint: sm ? `GST on commission ${money(sm.gst_on_commission)}` : "" },
    { key: "payouts", label: "VENDOR PAYOUTS", value: sm ? money(sm.vendor_payouts) : "—", icon: "swap-horizontal-outline" as const, hint: sm ? `${money(sm.payouts_due_now)} due now` : "" },
    { key: "tax", label: "TAX COLLECTED", value: sm ? money(sm.tax_collected) : "—", icon: "receipt-outline" as const, hint: "Booking taxes (8%)" },
  ];

  return (
    <AdminShell title="Finance">
      <View style={s.grid} testID="finance-summary">
        {cards.map((c) => (
          <View key={c.key} style={s.card} testID={`finance-${c.key}`}>
            <View style={s.cardTop}>
              <Text style={s.cardLabel}>{c.label}</Text>
              <Ionicons name={c.icon} size={15} color={colors.primary} />
            </View>
            <Text style={s.cardValue}>{c.value}</Text>
            <Text style={s.cardHint}>{c.hint}</Text>
          </View>
        ))}
      </View>

      <Text style={s.section}>Monthly breakdown</Text>
      <View style={{ marginBottom: spacing.lg }} testID="finance-monthly">
        <AdminTable
          rows={(data?.monthly ?? []).map((r) => ({ ...r, _key: r.label }))}
          cols={[
            { key: "label", label: "MONTH", render: (r) => <Text style={s.cellBold}>{r.label.toUpperCase()}</Text> },
            { key: "gross", label: "GROSS", render: (r) => <Text style={s.cell}>{money(r.gross)}</Text> },
            { key: "commission", label: "COMMISSION", render: (r) => <Text style={[s.cell, { color: colors.primary }]}>{money(r.commission)}</Text> },
            { key: "payouts", label: "VENDOR PAYOUTS", render: (r) => <Text style={s.cell}>{money(r.payouts)}</Text> },
            { key: "tax", label: "TAX", render: (r) => <Text style={s.cell}>{money(r.tax)}</Text> },
          ]}
          empty="No revenue yet"
        />
      </View>

      <Text style={s.section}>Vendor payouts</Text>
      <View testID="finance-payouts">
        <AdminTable
          rows={(data?.payouts ?? []).map((r) => ({ ...r, _key: r.vendor_id }))}
          cols={[
            { key: "vendor_name", label: "VENDOR", flex: 2, render: (r) => <Text style={s.cellBold}>{r.vendor_name}</Text> },
            { key: "bookings", label: "BOOKINGS", render: (r) => <Text style={s.cell}>{r.bookings}</Text> },
            { key: "gross", label: "GROSS", render: (r) => <Text style={s.cell}>{money(r.gross)}</Text> },
            { key: "commission", label: "COMMISSION", render: (r) => <Text style={[s.cell, { color: colors.primary }]}>{money(r.commission)}</Text> },
            { key: "due_now", label: "DUE NOW", render: (r) => <Text style={[s.cell, { color: colors.success }]}>{money(r.due_now)}</Text> },
            { key: "pending", label: "PENDING", render: (r) => r.pending > 0 ? <Badge tone="warn" label={money(r.pending)} /> : <Text style={s.cellMuted}>—</Text> },
          ]}
          empty="No payouts"
        />
      </View>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  card: { flexGrow: 1, flexBasis: 220, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  cardValue: { color: colors.textPrimary, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5 },
  cardHint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 6 },
  section: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 17, letterSpacing: -0.3, marginBottom: spacing.sm },
  cell: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  cellBold: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 },
  cellMuted: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
});

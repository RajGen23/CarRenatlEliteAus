import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AdminShell } from "@/src/components/AdminShell";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Metrics = {
  gmv: number; abv: number; ltv: number; cac: number | null;
  fleet_utilization: number; repeat_rate: number;
  bookings_count: number; unique_customers: number; fleet_size: number;
  marketing_spend: number | null;
  trend: { label: string; value: number }[];
};

const money = (n: number) => `$${(n ?? 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

export default function AdminRevenue() {
  const [m, setM] = useState<Metrics | null>(null);
  const load = useCallback(async () => { setM(await api.get<Metrics>("/admin/revenue-metrics")); }, []);
  useEffect(() => { load(); }, [load]);

  const kpis = m ? [
    { key: "gmv", label: "GMV", value: money(m.gmv), icon: "trending-up-outline" as const, hint: `${m.bookings_count} confirmed bookings` },
    { key: "abv", label: "AVG BOOKING VALUE", value: money(m.abv), icon: "stats-chart-outline" as const, hint: "GMV ÷ bookings" },
    { key: "ltv", label: "CUSTOMER LTV", value: money(m.ltv), icon: "diamond-outline" as const, hint: `${m.unique_customers} paying customers` },
    {
      key: "cac", label: "CAC", value: m.cac == null ? "—" : money(m.cac), icon: "magnet-outline" as const,
      hint: m.marketing_spend == null ? "Marketing spend not configured" : `${money(m.marketing_spend)} spend · last 6 months`,
    },
    { key: "utilization", label: "FLEET UTILIZATION", value: `${m.fleet_utilization}%`, icon: "speedometer-outline" as const, hint: `${m.fleet_size} vehicles · last 30 days` },
    { key: "repeat", label: "REPEAT RATE", value: `${m.repeat_rate}%`, icon: "repeat-outline" as const, hint: "Customers with 2+ bookings" },
  ] : [];

  const maxTrend = useMemo(() => Math.max(1, ...(m?.trend ?? []).map((x) => x.value)), [m]);
  const ltvCacRatio = m && m.cac != null && m.cac > 0 ? (m.ltv / m.cac).toFixed(1) : null;

  return (
    <AdminShell title="Revenue">
      <View style={s.grid} testID="revenue-kpi-grid">
        {kpis.map((k) => (
          <View key={k.key} style={s.card} testID={`rev-${k.key}`}>
            <View style={s.cardTop}>
              <Text style={s.cardLabel}>{k.label}</Text>
              <Ionicons name={k.icon} size={15} color={colors.primary} />
            </View>
            <Text style={s.cardValue}>{k.value}</Text>
            <Text style={s.cardHint}>{k.hint}</Text>
          </View>
        ))}
      </View>

      {ltvCacRatio ? (
        <View style={s.ratioBar} testID="rev-ltv-cac">
          <Ionicons name="flash-outline" size={14} color={colors.success} />
          <Text style={s.ratioText}>
            LTV : CAC ratio is <Text style={{ color: colors.success, fontFamily: fonts.bodyBold }}>{ltvCacRatio}x</Text> — every $1 of acquisition spend returns ${ltvCacRatio} in customer lifetime value.
          </Text>
        </View>
      ) : null}

      <View style={s.panel} testID="rev-gmv-trend">
        <View style={s.panelHead}>
          <Text style={s.panelTitle}>GMV trend · last 6 months</Text>
          <Text style={s.panelSub}>{m ? money(m.gmv) : "—"} total</Text>
        </View>
        <View style={s.chartRow}>
          {(m?.trend ?? []).map((b, i, arr) => {
            const last = i === arr.length - 1;
            const h = Math.max(8, Math.round((b.value / maxTrend) * 140));
            return (
              <View key={`${b.label}-${i}`} style={s.barCol}>
                <Text style={s.barValue}>{b.value > 0 ? `$${Math.round(b.value / 1000)}k` : "·"}</Text>
                <View style={[s.bar, { height: h }, last && s.barActive]} />
                <Text style={[s.barLabel, last && { color: colors.primary }]}>{b.label.toUpperCase()}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={s.note}>
        {m?.marketing_spend == null
          ? "CAC is unavailable until a monthly marketing spend is configured on the server (MARKETING_SPEND_MONTHLY)."
          : "CAC uses the monthly marketing spend configured on the server, not live ad-platform data."}
      </Text>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md },
  card: { flexGrow: 1, flexBasis: 220, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  cardValue: { color: colors.textPrimary, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5 },
  cardHint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 6 },
  ratioBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(124,227,166,0.06)", borderWidth: 1, borderColor: "rgba(124,227,166,0.25)", borderRadius: radius.md, padding: 12, marginBottom: spacing.lg },
  ratioText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, flex: 1 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  panelHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.lg },
  panelTitle: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 17, letterSpacing: -0.3 },
  panelSub: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 12 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, height: 190 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 8 },
  bar: { width: "62%", maxWidth: 64, borderRadius: 8, backgroundColor: "rgba(212,175,55,0.25)", borderWidth: 1, borderColor: "rgba(212,175,55,0.35)" },
  barActive: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  barValue: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 10 },
  barLabel: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.5 },
  note: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, fontStyle: "italic" },
});

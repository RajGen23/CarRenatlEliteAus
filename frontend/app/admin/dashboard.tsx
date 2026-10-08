import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Metrics = {
  total_revenue: number;
  platform_commission: number;
  total_bookings: number;
  active_rentals: number;
  total_customers: number;
  total_vendors: number;
  monthly_growth: number;
  new_users_30d: number;
  monthly: { label: string; value: number }[];
};

type Booking = {
  booking_id: string;
  car_brand: string;
  car_model: string;
  customer_name?: string;
  customer_email?: string;
  total: number;
  commission: number;
  status: string;
  created_at: string;
};

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

export default function AdminDashboard() {
  const [m, setM] = useState<Metrics | null>(null);
  const [recent, setRecent] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [metrics, bookings] = await Promise.all([
        api.get<Metrics>("/admin/dashboard"),
        api.get<Booking[]>("/admin/bookings"),
      ]);
      setM(metrics);
      setRecent(bookings.slice(0, 8));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => {
    if (!m) return [];
    return [
      { key: "revenue", label: "TOTAL REVENUE", value: money(m.total_revenue), icon: "cash-outline" as const, hint: "Gross booking value" },
      { key: "commission", label: "COMMISSION", value: money(m.platform_commission), icon: "pie-chart-outline" as const, hint: "Platform earnings · 15%" },
      { key: "bookings", label: "BOOKINGS", value: String(m.total_bookings), icon: "calendar-outline" as const, hint: "All time" },
      { key: "active", label: "ACTIVE RENTALS", value: String(m.active_rentals), icon: "speedometer-outline" as const, hint: "On the road now" },
      { key: "customers", label: "CUSTOMERS", value: String(m.total_customers), icon: "people-outline" as const, hint: `+${m.new_users_30d} in last 30 days` },
      { key: "vendors", label: "VENDORS", value: String(m.total_vendors), icon: "business-outline" as const, hint: "Active hosts" },
      {
        key: "growth",
        label: "MONTHLY GROWTH",
        value: `${m.monthly_growth >= 0 ? "+" : ""}${m.monthly_growth}%`,
        icon: m.monthly_growth >= 0 ? ("trending-up-outline" as const) : ("trending-down-outline" as const),
        hint: "Revenue vs prior month",
        tone: m.monthly_growth >= 0 ? colors.success : colors.error,
      },
    ];
  }, [m]);

  const maxMonthly = useMemo(
    () => Math.max(1, ...(m?.monthly ?? []).map((x) => x.value)),
    [m]
  );

  return (
    <AdminShell title="Overview">
      {error ? (
        <View style={s.errorBox} testID="dashboard-error">
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={s.kpiGrid} testID="dashboard-kpi-grid">
        {kpis.map((k) => (
          <View key={k.key} style={s.kpiCard} testID={`kpi-${k.key}`}>
            <View style={s.kpiTop}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Ionicons name={k.icon} size={15} color={(k as any).tone ?? colors.primary} />
            </View>
            <Text style={[s.kpiValue, (k as any).tone ? { color: (k as any).tone } : null]}>
              {m ? k.value : "—"}
            </Text>
            <Text style={s.kpiHint}>{k.hint}</Text>
          </View>
        ))}
      </View>

      <View style={s.panel} testID="dashboard-revenue-chart">
        <View style={s.panelHead}>
          <Text style={s.panelTitle}>Revenue · last 6 months</Text>
          <Text style={s.panelSub}>{m ? money(m.total_revenue) : "—"} gross</Text>
        </View>
        <View style={s.chartRow}>
          {(m?.monthly ?? []).map((b, i, arr) => {
            const last = i === arr.length - 1;
            const h = Math.max(8, Math.round((b.value / maxMonthly) * 140));
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

      <View style={s.sectionHead}>
        <Text style={s.panelTitle}>Recent bookings</Text>
      </View>
      <AdminTable
        rows={recent.map((r) => ({ ...r, _key: r.booking_id }))}
        cols={[
          { key: "car", label: "VEHICLE", flex: 2, render: (r) => (
            <View>
              <Text style={s.cellMain}>{r.car_brand} {r.car_model}</Text>
              <Text style={s.cellSub}>{r.booking_id}</Text>
            </View>
          ) },
          { key: "customer", label: "CUSTOMER", flex: 1.6, render: (r) => (
            <View>
              <Text style={s.cellMain}>{r.customer_name ?? "—"}</Text>
              <Text style={s.cellSub}>{r.customer_email ?? ""}</Text>
            </View>
          ) },
          { key: "total", label: "TOTAL", render: (r) => <Text style={s.cellMain}>{money(r.total)}</Text> },
          { key: "commission", label: "COMMISSION", render: (r) => <Text style={[s.cellMain, { color: colors.primary }]}>{money(r.commission)}</Text> },
          { key: "status", label: "STATUS", render: (r) => (
            <Badge
              tone={r.status === "completed" ? "ok" : r.status === "cancelled" ? "danger" : "warn"}
              label={(r.status ?? "").toUpperCase()}
            />
          ) },
        ]}
        empty="No bookings yet"
      />
    </AdminShell>
  );
}

const s = StyleSheet.create({
  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,107,107,0.08)", borderColor: "rgba(255,107,107,0.3)", borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: spacing.md },
  errorText: { color: colors.error, fontFamily: fonts.body, fontSize: 12, flex: 1 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  kpiCard: { flexGrow: 1, flexBasis: 200, minWidth: 180, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  kpiTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  kpiLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  kpiValue: { color: colors.textPrimary, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5 },
  kpiHint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 6 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  panelHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.lg },
  panelTitle: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 17, letterSpacing: -0.3 },
  panelSub: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 12 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, height: 190 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 8 },
  bar: { width: "62%", maxWidth: 64, borderRadius: 8, backgroundColor: "rgba(212,175,55,0.25)", borderWidth: 1, borderColor: "rgba(212,175,55,0.35)" },
  barActive: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  barValue: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 10 },
  barLabel: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.5 },
  sectionHead: { marginBottom: spacing.sm },
  cellMain: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});

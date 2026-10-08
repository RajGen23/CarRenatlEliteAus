import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge, ActionBtn } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, spacing } from "@/src/theme";

type Car = { car_id: string; brand: string; model: string; image?: string; rating?: number; price_per_day: number; featured: boolean; vendor_name: string; available?: boolean };
type Sub = { user_id: string; vendor_name: string; email?: string; plan: string; price: number; renews_at?: string | null; vehicles_count: number };

const PLAN_TONE: Record<string, "ok" | "warn" | "muted"> = { elite: "warn", premium: "ok", free: "muted" };

export default function AdminFeatured() {
  const [cars, setCars] = useState<Car[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);

  const load = useCallback(async () => {
    const [c, sList] = await Promise.all([
      api.get<Car[]>("/admin/featured"),
      api.get<Sub[]>("/admin/subscriptions"),
    ]);
    setCars(c);
    setSubs(sList);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (c: Car) => { await api.post(`/admin/cars/${c.car_id}/feature`); load(); };
  const setPlan = async (v: Sub, plan: string) => { await api.post(`/admin/subscriptions/${v.user_id}`, { plan }); load(); };

  const featuredCount = cars.filter((c) => c.featured).length;

  return (
    <AdminShell title="Featured & Subscriptions">
      <Text style={s.section}>Featured listings <Text style={s.sectionSub}>· {featuredCount} featured (shown first on consumer home)</Text></Text>
      <View style={{ marginBottom: spacing.lg }} testID="featured-cars">
        <AdminTable
          rows={cars.map((r) => ({ ...r, _key: r.car_id }))}
          cols={[
            { key: "car", label: "VEHICLE", flex: 2.2, render: (r) => (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {r.image ? <Image source={{ uri: r.image }} style={s.thumb} /> : <View style={s.thumb} />}
                <View>
                  <Text style={s.cellBold}>{r.brand} {r.model}</Text>
                  <Text style={s.cellSub}>{r.vendor_name}</Text>
                </View>
              </View>
            ) },
            { key: "rating", label: "RATING", render: (r) => <Text style={s.cell}>★ {(r.rating ?? 0).toFixed(1)}</Text> },
            { key: "price_per_day", label: "PRICE / DAY", render: (r) => <Text style={s.cell}>${r.price_per_day}</Text> },
            { key: "featured", label: "FEATURED", render: (r) => <Badge tone={r.featured ? "warn" : "muted"} label={r.featured ? "★ FEATURED" : "—"} /> },
            { key: "actions", label: "", render: (r) => (
              <ActionBtn
                testID={`feature-toggle-${r.car_id}`}
                label={r.featured ? "Unfeature" : "Feature"}
                tone={r.featured ? "outline" : "primary"}
                onPress={() => toggle(r)}
              />
            ) },
          ]}
          empty="No vehicles"
        />
      </View>

      <Text style={s.section}>Vendor subscriptions <Text style={s.sectionSub}>· Free $0 · Premium $199/mo · Elite $499/mo</Text></Text>
      <View testID="vendor-subscriptions">
        <AdminTable
          rows={subs.map((r) => ({ ...r, _key: r.user_id }))}
          cols={[
            { key: "vendor_name", label: "VENDOR", flex: 1.8, render: (r) => (
              <View><Text style={s.cellBold}>{r.vendor_name}</Text><Text style={s.cellSub}>{r.email} · {r.vehicles_count} vehicles</Text></View>
            ) },
            { key: "plan", label: "PLAN", render: (r) => <Badge tone={PLAN_TONE[r.plan] ?? "muted"} label={r.plan.toUpperCase()} /> },
            { key: "price", label: "PRICE", render: (r) => <Text style={s.cell}>{r.price > 0 ? `$${r.price}/mo` : "Free"}</Text> },
            { key: "renews_at", label: "RENEWS", render: (r) => <Text style={s.cell}>{r.renews_at ? new Date(r.renews_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}</Text> },
            { key: "actions", label: "SET PLAN", flex: 1.8, render: (r) => (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {["free", "premium", "elite"].filter((p) => p !== r.plan).map((p) => (
                  <ActionBtn key={p} testID={`set-plan-${p}-${r.user_id}`} label={p[0].toUpperCase() + p.slice(1)} tone={p === "elite" ? "primary" : "outline"} onPress={() => setPlan(r, p)} />
                ))}
              </View>
            ) },
          ]}
          empty="No vendors"
        />
      </View>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  section: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 17, letterSpacing: -0.3, marginBottom: spacing.sm },
  sectionSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  thumb: { width: 44, height: 30, borderRadius: 6, backgroundColor: colors.surfaceElevated },
  cell: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  cellBold: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});

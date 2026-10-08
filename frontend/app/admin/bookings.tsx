import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge, ActionBtn } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius } from "@/src/theme";

type B = { booking_id: string; customer_name?: string; customer_email?: string; car_brand: string; car_model: string; pickup_datetime: string; days: number; total: number; commission: number; net: number; status: string; refund_status?: string };

export default function AdminBookings() {
  const [status, setStatus] = useState("all");
  const [refund, setRefund] = useState("all");
  const [rows, setRows] = useState<B[]>([]);
  const load = useCallback(async () => { setRows(await api.get<B[]>(`/admin/bookings?status=${status}&refund=${refund}`)); }, [status, refund]);
  useEffect(() => { load(); }, [load]);

  const doRefund = async (b: B) => { await api.post(`/admin/bookings/${b.booking_id}/refund`, { amount: b.total, reason: "Approved by admin" }); load(); };

  return (
    <AdminShell title="Bookings">
      <View style={s.filterRow}>
        <View style={s.filterGroup}>
          {["all", "upcoming", "completed", "cancelled"].map((f) => (
            <Pressable key={f} onPress={() => setStatus(f)} style={[s.chip, status === f && s.chipActive]}>
              <Text style={[s.chipText, status === f && s.chipTextActive]}>{f.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <View style={s.filterGroup}>
          {["all", "requested"].map((f) => (
            <Pressable key={f} onPress={() => setRefund(f)} style={[s.chip, refund === f && s.chipActive]}>
              <Text style={[s.chipText, refund === f && s.chipTextActive]}>{f === "all" ? "ALL REFUNDS" : "REFUND REQUESTED"}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={s.count}>{rows.length} bookings</Text>
      <AdminTable
        rows={rows.map((r) => ({ ...r, _key: r.booking_id }))}
        cols={[
          { key: "customer", label: "CUSTOMER", flex: 1.5, render: (r) => (
            <View><Text style={s.cellMain}>{r.customer_name ?? "—"}</Text><Text style={s.cellSub}>{r.customer_email ?? "—"}</Text></View>
          ) },
          { key: "car", label: "VEHICLE", flex: 1.2, render: (r) => (
            <View><Text style={s.cellMain}>{r.car_brand} {r.car_model}</Text><Text style={s.cellSub}>{new Date(r.pickup_datetime).toLocaleDateString("en-AU")} · {r.days}d</Text></View>
          ) },
          { key: "total", label: "TOTAL", render: (r) => <Text style={s.cellMain}>${r.total.toFixed(0)}</Text> },
          { key: "commission", label: "COMMISSION", render: (r) => <Text style={s.cellMain}>${r.commission.toFixed(0)}</Text> },
          { key: "status", label: "STATUS", render: (r) => {
            const t = r.status === "completed" ? "ok" : r.status === "cancelled" ? "danger" : "warn";
            return <Badge tone={t as any} label={r.status.toUpperCase()} />;
          } },
          { key: "refund", label: "REFUND", render: (r) => {
            if (r.refund_status === "approved") return <Badge tone="ok" label="REFUNDED" />;
            if (r.refund_status === "requested") return <Badge tone="warn" label="REQUESTED" />;
            return <Text style={s.cellSub}>—</Text>;
          } },
          { key: "actions", label: "", flex: 0.9, render: (r) => (
            (r.status !== "cancelled" || r.refund_status === "requested") ? <ActionBtn label="Refund" tone="danger" onPress={() => doRefund(r)} /> : <Text style={s.cellSub}>—</Text>
          ) },
        ]}
        empty="No bookings match"
      />
    </AdminShell>
  );
}

const s = StyleSheet.create({
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  filterGroup: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 },
  chipTextActive: { color: "#000" },
  count: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: 12, letterSpacing: 1 },
  cellMain: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge, ActionBtn } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius } from "@/src/theme";

type C = { car_id: string; brand: string; model: string; category: string; price_per_day: number; image: string; available: boolean; approval_status?: string; insurance_expiry?: string; insurance_days_left?: number; insurance_alert?: boolean; vendor_id?: string };

export default function AdminVehicles() {
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<C[]>([]);
  const load = useCallback(async () => { setRows(await api.get<C[]>(`/admin/cars?status=${status}`)); }, [status]);
  useEffect(() => { load(); }, [load]);

  const approve = async (c: C) => { await api.post(`/admin/cars/${c.car_id}/approve`); load(); };
  const reject = async (c: C) => { await api.post(`/admin/cars/${c.car_id}/reject`); load(); };

  const insAlert = rows.filter((r) => r.insurance_alert).length;

  return (
    <AdminShell title="Vehicles">
      {insAlert > 0 ? (
        <View style={s.alert}>
          <Text style={s.alertText}>⚠️ {insAlert} vehicle{insAlert > 1 ? "s" : ""} have insurance expiring within 30 days.</Text>
        </View>
      ) : null}
      <View style={s.filterGroup}>
        {["all", "approved", "pending", "rejected"].map((f) => (
          <Pressable key={f} onPress={() => setStatus(f)} style={[s.chip, status === f && s.chipActive]}>
            <Text style={[s.chipText, status === f && s.chipTextActive]}>{f.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.count}>{rows.length} vehicles</Text>
      <AdminTable
        rows={rows.map((r) => ({ ...r, _key: r.car_id }))}
        cols={[
          { key: "car", label: "VEHICLE", flex: 2, render: (r) => (
            <View style={s.vehicleCell}>
              <Image source={{ uri: r.image }} style={s.thumb} />
              <View><Text style={s.cellMain}>{r.brand} {r.model}</Text><Text style={s.cellSub}>{r.category} · {r.car_id.startsWith("vcar") ? "Vendor" : "Platform"}</Text></View>
            </View>
          ) },
          { key: "price", label: "RATE", render: (r) => <Text style={s.cellMain}>${r.price_per_day}/day</Text> },
          { key: "approval_status", label: "APPROVAL", render: (r) => {
            const a = r.approval_status ?? "approved";
            return <Badge tone={a === "approved" ? "ok" : a === "rejected" ? "danger" : "warn"} label={a.toUpperCase()} />;
          } },
          { key: "insurance", label: "INSURANCE", render: (r) => {
            if (!r.insurance_expiry) return <Text style={s.cellSub}>—</Text>;
            if (r.insurance_alert) return <Badge tone="danger" label={`${r.insurance_days_left}D LEFT`} />;
            return <Badge tone="ok" label="VALID" />;
          } },
          { key: "actions", label: "ACTIONS", flex: 1.4, render: (r) => {
            const a = r.approval_status ?? "approved";
            return (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {a !== "approved" ? <ActionBtn label="Approve" tone="primary" onPress={() => approve(r)} /> : null}
                {a !== "rejected" ? <ActionBtn label="Reject" tone="outline" onPress={() => reject(r)} /> : null}
              </View>
            );
          } },
        ]}
        empty="No vehicles"
      />
    </AdminShell>
  );
}

const s = StyleSheet.create({
  alert: { backgroundColor: "rgba(255,107,107,0.08)", borderColor: "rgba(255,107,107,0.3)", borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 14 },
  alertText: { color: colors.error, fontFamily: fonts.bodyBold, fontSize: 12 },
  filterGroup: { flexDirection: "row", gap: 6, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 },
  chipTextActive: { color: "#000" },
  count: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: 12, letterSpacing: 1 },
  vehicleCell: { flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: { width: 50, height: 32, borderRadius: 6 },
  cellMain: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});

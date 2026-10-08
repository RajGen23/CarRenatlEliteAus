import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge, ActionBtn } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts } from "@/src/theme";

type V = { user_id: string; name: string; email?: string; username?: string; status: string; vehicles_count: number; bookings_count: number; vendor_profile?: any };

export default function AdminVendors() {
  const [rows, setRows] = useState<V[]>([]);
  const load = useCallback(async () => { setRows(await api.get<V[]>("/admin/vendors")); }, []);
  useEffect(() => { load(); }, [load]);

  const kyc = async (v: V, decision: "approved" | "rejected") => {
    await api.post(`/admin/vendors/${v.user_id}/kyc`, { decision });
    load();
  };
  const suspend = async (v: V) => { await api.post(`/admin/vendors/${v.user_id}/suspend`); load(); };

  return (
    <AdminShell title="Vendors">
      <Text style={s.count}>{rows.length} hosts</Text>
      <AdminTable
        rows={rows.map((r) => ({ ...r, _key: r.user_id }))}
        cols={[
          { key: "name", label: "HOST", flex: 2, render: (r) => (
            <View><Text style={s.cellMain}>{r.vendor_profile?.company ?? r.name}</Text><Text style={s.cellSub}>{r.name} · {r.email ?? r.username}</Text></View>
          ) },
          { key: "vehicles_count", label: "VEHICLES", render: (r) => <Text style={s.cellMain}>{r.vehicles_count}</Text> },
          { key: "kyc_status", label: "KYC", render: (r) => {
            const k = r.vendor_profile?.kyc_status || "pending";
            return <Badge tone={k === "approved" ? "ok" : k === "rejected" ? "danger" : "warn"} label={k.toUpperCase()} />;
          } },
          { key: "status", label: "STATUS", render: (r) => <Badge tone={r.status === "suspended" ? "danger" : "ok"} label={(r.status ?? "active").toUpperCase()} /> },
          { key: "actions", label: "ACTIONS", flex: 2, render: (r) => {
            const k = r.vendor_profile?.kyc_status || "pending";
            return (
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {k !== "approved" ? <ActionBtn label="Approve KYC" tone="primary" onPress={() => kyc(r, "approved")} /> : null}
                {k !== "rejected" ? <ActionBtn label="Reject KYC" tone="outline" onPress={() => kyc(r, "rejected")} /> : null}
                <ActionBtn label={r.status === "suspended" ? "Reinstate" : "Suspend"} tone={r.status === "suspended" ? "outline" : "danger"} onPress={() => suspend(r)} />
              </View>
            );
          } },
        ]}
        empty="No vendors"
      />
    </AdminShell>
  );
}

const s = StyleSheet.create({
  count: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: 12, letterSpacing: 1 },
  cellMain: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});

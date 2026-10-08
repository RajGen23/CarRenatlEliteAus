import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge, ActionBtn } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type U = { user_id: string; username?: string; email?: string; name: string; role: string; status: string; verified: boolean; wallet_balance: number; bookings_count: number; is_vendor?: boolean; created_at: string };

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<U[]>([]);

  const load = useCallback(async () => {
    const data = await api.get<U[]>(`/admin/users?role=user&status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    setRows(data);
  }, [q, status]);
  useEffect(() => { load(); }, [load]);

  const block = async (u: U) => { await api.post(`/admin/users/${u.user_id}/block`); load(); };
  const verify = async (u: U) => { await api.post(`/admin/users/${u.user_id}/verify`); load(); };

  return (
    <AdminShell title="Customers">
      <View style={s.toolbar}>
        <View style={s.search}>
          <Ionicons name="search" size={14} color={colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search by name, email or username…" placeholderTextColor={colors.textMuted} style={s.searchInput} />
        </View>
        <View style={s.filterGroup}>
          {["all", "active", "blocked"].map((f) => (
            <Pressable key={f} onPress={() => setStatus(f)} style={[s.chip, status === f && s.chipActive]}>
              <Text style={[s.chipText, status === f && s.chipTextActive]}>{f.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={s.count}>{rows.length} customers</Text>
      <AdminTable
        rows={rows.map((r) => ({ ...r, _key: r.user_id }))}
        cols={[
          { key: "name", label: "NAME", flex: 2, render: (r) => (
            <View><Text style={s.cellMain}>{r.name}</Text><Text style={s.cellSub}>@{r.username ?? "—"} · {r.email}</Text></View>
          ) },
          { key: "wallet_balance", label: "WALLET", render: (r) => <Text style={s.cellMain}>${(r.wallet_balance ?? 0).toFixed(0)}</Text> },
          { key: "bookings_count", label: "BOOKINGS", render: (r) => <Text style={s.cellMain}>{r.bookings_count ?? 0}</Text> },
          { key: "verified", label: "VERIFIED", render: (r) => <Badge tone={r.verified ? "ok" : "muted"} label={r.verified ? "VERIFIED" : "PENDING"} /> },
          { key: "status", label: "STATUS", render: (r) => <Badge tone={r.status === "blocked" ? "danger" : "ok"} label={(r.status ?? "active").toUpperCase()} /> },
          { key: "actions", label: "ACTIONS", flex: 1.4, render: (r) => (
            <View style={{ flexDirection: "row", gap: 6 }}>
              {!r.verified ? <ActionBtn label="Verify" tone="primary" onPress={() => verify(r)} /> : null}
              <ActionBtn label={r.status === "blocked" ? "Unblock" : "Block"} tone={r.status === "blocked" ? "outline" : "danger"} onPress={() => block(r)} />
            </View>
          ) },
        ]}
        empty="No customers match"
      />
    </AdminShell>
  );
}

const s = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  searchInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  filterGroup: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 },
  chipTextActive: { color: "#000" },
  count: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: spacing.sm, letterSpacing: 1 },
  cellMain: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});

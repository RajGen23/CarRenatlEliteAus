import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge, ActionBtn } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Coupon = { code: string; discount_pct: number; description: string; active: boolean; created_at?: string };

export default function AdminCoupons() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", discount_pct: "", description: "" });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { setRows(await api.get<Coupon[]>("/admin/coupons")); }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (c: Coupon) => { await api.patch(`/admin/coupons/${c.code}`, { active: !c.active }); load(); };
  const del = async (c: Coupon) => { await api.del(`/admin/coupons/${c.code}`); load(); };

  const create = async () => {
    setErr(null);
    const pct = parseInt(form.discount_pct, 10);
    if (!form.code.trim() || isNaN(pct) || pct <= 0 || pct > 100) { setErr("Code and discount % (1–100) are required"); return; }
    try {
      await api.post("/admin/coupons", { code: form.code.trim().toUpperCase(), discount_pct: pct, description: form.description.trim() || `${pct}% off` });
      setOpen(false);
      setForm({ code: "", discount_pct: "", description: "" });
      load();
    } catch (e: any) { setErr(e?.message ?? "Could not create coupon"); }
  };

  return (
    <AdminShell
      title="Coupons"
      action={
        <Pressable onPress={() => setOpen(true)} style={s.newBtn} testID="new-coupon">
          <Ionicons name="add" size={14} color="#000" />
          <Text style={s.newBtnText}>New coupon</Text>
        </Pressable>
      }
    >
      <Text style={s.count}>{rows.length} coupons</Text>
      <AdminTable
        rows={rows.map((r) => ({ ...r, _key: r.code }))}
        cols={[
          { key: "code", label: "CODE", render: (r) => <Text style={s.code}>{r.code}</Text> },
          { key: "discount_pct", label: "DISCOUNT", render: (r) => <Text style={s.cellMain}>{r.discount_pct}% off</Text> },
          { key: "description", label: "DESCRIPTION", flex: 2, render: (r) => <Text style={s.cellMain}>{r.description}</Text> },
          { key: "active", label: "STATUS", render: (r) => <Badge tone={r.active ? "ok" : "muted"} label={r.active ? "ACTIVE" : "DISABLED"} /> },
          { key: "actions", label: "", flex: 1.4, render: (r) => (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <ActionBtn label={r.active ? "Disable" : "Enable"} tone="outline" onPress={() => toggle(r)} />
              <ActionBtn label="Delete" tone="danger" onPress={() => del(r)} />
            </View>
          ) },
        ]}
        empty="No coupons yet"
      />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>New coupon</Text>
              <Pressable onPress={() => setOpen(false)}><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable>
            </View>
            <View style={{ gap: spacing.md }}>
              <Field label="CODE *" value={form.code} onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })} placeholder="e.g. SUMMER25" />
              <Field label="DISCOUNT % *" value={form.discount_pct} onChangeText={(v) => setForm({ ...form, discount_pct: v.replace(/[^0-9]/g, "") })} placeholder="25" keyboardType="number-pad" />
              <Field label="DESCRIPTION" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Summer special · 25% off" />
              {err ? <Text style={s.err}>{err}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <Pressable onPress={() => setOpen(false)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
                <Pressable onPress={create} style={s.create}><Text style={s.createText}>Create</Text></Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={s.fl}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.textMuted} style={s.fi} />
    </View>
  );
}

const s = StyleSheet.create({
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full },
  newBtnText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5 },
  count: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: 12, letterSpacing: 1 },
  code: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  cellMain: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.lg },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 18 },
  fl: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold, marginBottom: 5 },
  fi: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: radius.md, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14 },
  err: { color: colors.error, fontFamily: fonts.body, fontSize: 12 },
  cancel: { flex: 1, paddingVertical: 12, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5 },
  create: { flex: 1, paddingVertical: 12, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: "center" },
  createText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5 },
});

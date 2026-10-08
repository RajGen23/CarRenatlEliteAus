import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Referral = {
  referral_id: string; referrer_name: string; referee_name: string;
  status: string; reward_total: number; created_at: string; completed_at?: string | null;
};
type Data = {
  config: { enabled: boolean; reward_referrer: number; reward_referee: number };
  stats: { total: number; completed: number; pending: number; rewards_paid: number };
  rows: Referral[];
};

export default function AdminReferrals() {
  const [data, setData] = useState<Data | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [refReward, setRefReward] = useState("50");
  const [refereeReward, setRefereeReward] = useState("25");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const d = await api.get<Data>("/admin/referrals");
    setData(d);
    setEnabled(d.config.enabled);
    setRefReward(String(d.config.reward_referrer));
    setRefereeReward(String(d.config.reward_referee));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    await api.post("/admin/referrals/config", {
      enabled,
      reward_referrer: parseFloat(refReward) || 0,
      reward_referee: parseFloat(refereeReward) || 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  };

  const st = data?.stats;
  const cards = [
    { key: "total", label: "TOTAL REFERRALS", value: st?.total ?? "—", icon: "people-outline" as const },
    { key: "completed", label: "COMPLETED", value: st?.completed ?? "—", icon: "checkmark-circle-outline" as const },
    { key: "pending", label: "PENDING", value: st?.pending ?? "—", icon: "hourglass-outline" as const },
    { key: "rewards", label: "REWARDS PAID", value: st ? `$${st.rewards_paid.toLocaleString()}` : "—", icon: "gift-outline" as const },
  ];

  return (
    <AdminShell title="Referral Program">
      <View style={s.configCard} testID="referral-config">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <Pressable testID="referral-toggle" onPress={() => setEnabled(!enabled)} style={[s.toggle, enabled && s.toggleOn]}>
            <View style={[s.knob, enabled && s.knobOn]} />
          </Pressable>
          <View>
            <Text style={s.configTitle}>Program {enabled ? "active" : "paused"}</Text>
            <Text style={s.configSub}>Wallet credits granted when the referred friend completes their first booking</Text>
          </View>
        </View>
        <View style={s.rewardField}>
          <Text style={s.fl}>REFERRER $</Text>
          <TextInput testID="referrer-reward-input" value={refReward} onChangeText={(v) => setRefReward(v.replace(/[^0-9.]/g, ""))} style={s.fi} keyboardType="numeric" />
        </View>
        <View style={s.rewardField}>
          <Text style={s.fl}>FRIEND $</Text>
          <TextInput testID="referee-reward-input" value={refereeReward} onChangeText={(v) => setRefereeReward(v.replace(/[^0-9.]/g, ""))} style={s.fi} keyboardType="numeric" />
        </View>
        <Pressable testID="referral-save" onPress={save} style={s.saveBtn}>
          <Ionicons name={saved ? "checkmark" : "save-outline"} size={13} color="#000" />
          <Text style={s.saveText}>{saved ? "Saved" : "Save"}</Text>
        </Pressable>
      </View>

      <View style={s.grid} testID="referral-stats">
        {cards.map((c) => (
          <View key={c.key} style={s.card} testID={`ref-stat-${c.key}`}>
            <View style={s.cardTop}>
              <Text style={s.cardLabel}>{c.label}</Text>
              <Ionicons name={c.icon} size={15} color={colors.primary} />
            </View>
            <Text style={s.cardValue}>{c.value}</Text>
          </View>
        ))}
      </View>

      <Text style={s.count}>{data?.rows.length ?? 0} referrals</Text>
      <AdminTable
        rows={(data?.rows ?? []).map((r) => ({ ...r, _key: r.referral_id }))}
        cols={[
          { key: "referrer_name", label: "REFERRER", flex: 1.6, render: (r) => <Text style={s.cellBold}>{r.referrer_name}</Text> },
          { key: "referee_name", label: "REFERRED FRIEND", flex: 1.6, render: (r) => <Text style={s.cell}>{r.referee_name}</Text> },
          { key: "status", label: "STATUS", render: (r) => <Badge tone={r.status === "completed" ? "ok" : "warn"} label={r.status.toUpperCase()} /> },
          { key: "reward_total", label: "REWARD", render: (r) => <Text style={[s.cell, r.reward_total > 0 && { color: colors.success }]}>{r.reward_total > 0 ? `$${r.reward_total}` : "—"}</Text> },
          { key: "created_at", label: "DATE", render: (r) => <Text style={s.cellSub}>{new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</Text> },
        ]}
        empty="No referrals yet"
      />
    </AdminShell>
  );
}

const s = StyleSheet.create({
  configCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  toggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, padding: 2, justifyContent: "center" },
  toggleOn: { backgroundColor: "rgba(212,175,55,0.3)", borderColor: colors.primary },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textMuted },
  knobOn: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  configTitle: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 },
  configSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2, maxWidth: 380 },
  rewardField: { width: 90 },
  fl: { color: colors.textMuted, fontSize: 8, letterSpacing: 1.5, fontFamily: fonts.bodyBold, marginBottom: 4 },
  fi: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full },
  saveText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  card: { flexGrow: 1, flexBasis: 180, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  cardValue: { color: colors.textPrimary, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5 },
  count: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: spacing.sm, letterSpacing: 1 },
  cell: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  cellBold: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 },
});

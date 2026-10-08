import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, fonts, radius, spacing } from "@/src/theme";

export type Col<T> = { key: string; label: string; flex?: number; render?: (row: T) => React.ReactNode };

export function AdminTable<T extends { [k: string]: any }>({ rows, cols, empty }: { rows: T[]; cols: Col<T>[]; empty?: string }) {
  return (
    <View style={s.wrap}>
      <View style={[s.row, s.head]}>
        {cols.map((c) => (
          <View key={c.key} style={{ flex: c.flex ?? 1 }}>
            <Text style={s.headText}>{c.label}</Text>
          </View>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyText}>{empty ?? "No records"}</Text></View>
      ) : (
        rows.map((r, i) => (
          <View key={r._key ?? r.id ?? r.user_id ?? r.car_id ?? r.booking_id ?? r.code ?? i} style={[s.row, i % 2 ? s.rowAlt : null]}>
            {cols.map((c) => (
              <View key={c.key} style={{ flex: c.flex ?? 1, justifyContent: "center" }}>
                {c.render ? c.render(r) : <Text style={s.cellText}>{String(r[c.key] ?? "—")}</Text>}
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

export function Badge({ tone, label }: { tone: "ok" | "warn" | "danger" | "info" | "muted"; label: string }) {
  const m = {
    ok: { bg: "rgba(124,227,166,0.12)", bd: "rgba(124,227,166,0.35)", fg: colors.success },
    warn: { bg: "rgba(212,175,55,0.12)", bd: "rgba(212,175,55,0.4)", fg: colors.primary },
    danger: { bg: "rgba(255,107,107,0.12)", bd: "rgba(255,107,107,0.35)", fg: colors.error },
    info: { bg: "rgba(255,255,255,0.05)", bd: colors.border, fg: colors.textPrimary },
    muted: { bg: "rgba(255,255,255,0.03)", bd: colors.border, fg: colors.textMuted },
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: m.bg, borderColor: m.bd }]}>
      <Text style={[s.badgeText, { color: m.fg }]}>{label}</Text>
    </View>
  );
}

export function ActionBtn({ label, onPress, tone, testID }: { label: string; onPress: () => void; tone?: "primary" | "danger" | "outline"; testID?: string }) {
  const t = tone ?? "outline";
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.actBtn, t === "primary" && s.actPrimary, t === "danger" && s.actDanger, t === "outline" && s.actOutline, pressed && { opacity: 0.85 }]}>
      <Text style={[s.actText, t === "primary" && { color: "#000" }, t === "danger" && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: 12, alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowAlt: { backgroundColor: "rgba(255,255,255,0.015)" },
  head: { backgroundColor: "rgba(255,255,255,0.02)" },
  headText: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  cellText: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1 },
  actBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  actPrimary: { backgroundColor: colors.primary },
  actDanger: { backgroundColor: colors.error },
  actOutline: { borderWidth: 1, borderColor: colors.borderStrong },
  actText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.5 },
});

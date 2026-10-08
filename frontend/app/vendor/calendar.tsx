import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type CarLite = {
  car_id: string;
  brand: string;
  model: string;
  blocked_dates?: string[];
};

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthDays(year: number, month: number) {
  // returns array of Date for the calendar grid (with nulls for empty leading slots)
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const lead = first.getDay(); // 0..6
  const total = last.getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function VendorCalendar() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [car, setCar] = useState<CarLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    api.get<CarLite>(`/cars/${id}`).then((c) => {
      setCar(c);
      setLoading(false);
    }).catch((e) => {
      Alert.alert("Error", e.message);
      setLoading(false);
    });
  }, [id]);

  const blocked = useMemo(() => new Set(car?.blocked_dates ?? []), [car]);
  const days = useMemo(() => monthDays(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const today = useMemo(() => toIsoDate(new Date()), []);

  const togglePick = (iso: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const block = async () => {
    if (selected.size === 0) return Alert.alert("Select dates", "Tap dates to select before blocking.");
    setSaving(true);
    try {
      await api.post(`/vendor/cars/${id}/block`, { dates: Array.from(selected) });
      const c = await api.get<CarLite>(`/cars/${id}`);
      setCar(c);
      setSelected(new Set());
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  };

  const unblock = async () => {
    if (selected.size === 0) return Alert.alert("Select dates", "Tap blocked dates to unblock.");
    setSaving(true);
    try {
      await api.post(`/vendor/cars/${id}/unblock`, { dates: Array.from(selected) });
      const c = await api.get<CarLite>(`/cars/${id}`);
      setCar(c);
      setSelected(new Set());
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  };

  const monthLabel = cursor.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  if (loading) {
    return <Screen><View style={styles.center}><ActivityIndicator color={colors.primary} /></View></Screen>;
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable testID="cal-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>AVAILABILITY</Text>
          <Text style={styles.topTitle} numberOfLines={1}>{car?.brand} {car?.model}</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={styles.monthRow}>
          <Pressable testID="cal-prev" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={styles.monthBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable testID="cal-next" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={styles.monthBtn}>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <Text key={i} style={styles.weekHead}>{d}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {days.map((d, idx) => {
            if (!d) return <View key={idx} style={styles.cellEmpty} />;
            const iso = toIsoDate(d);
            const isPast = iso < today;
            const isBlocked = blocked.has(iso);
            const isSelected = selected.has(iso);
            return (
              <Pressable
                key={idx}
                testID={`cal-day-${iso}`}
                disabled={isPast}
                onPress={() => togglePick(iso)}
                style={[
                  styles.cell,
                  isPast && styles.cellPast,
                  isBlocked && styles.cellBlocked,
                  isSelected && styles.cellSelected,
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    isPast && styles.cellTextPast,
                    isBlocked && styles.cellTextBlocked,
                    isSelected && styles.cellTextSelected,
                  ]}
                >
                  {d.getDate()}
                </Text>
                {isBlocked ? <View style={styles.blockedDot} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.lDot, { backgroundColor: colors.primary }]} /><Text style={styles.lText}>Selected</Text></View>
          <View style={styles.legendItem}><View style={[styles.lDot, { backgroundColor: colors.error }]} /><Text style={styles.lText}>Blocked</Text></View>
          <View style={styles.legendItem}><View style={[styles.lDot, { backgroundColor: colors.textMuted }]} /><Text style={styles.lText}>Past</Text></View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            testID="unblock-btn"
            disabled={saving}
            onPress={unblock}
            style={({ pressed }) => [styles.outlineBtn, (pressed || saving) && { opacity: 0.85 }]}
          >
            <Ionicons name="lock-open-outline" size={16} color={colors.primary} />
            <Text style={styles.outlineBtnText}>Unblock</Text>
          </Pressable>
          <Pressable
            testID="block-btn"
            disabled={saving}
            onPress={block}
            style={({ pressed }) => [styles.solidBtn, (pressed || saving) && { opacity: 0.85 }]}
          >
            {saving ? <ActivityIndicator color="#000" /> : (
              <>
                <Ionicons name="lock-closed" size={16} color="#000" />
                <Text style={styles.solidBtnText}>Block dates</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={styles.hint}>Tap to select multiple dates. Blocked dates will not be bookable by renters.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  monthBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  monthLabel: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium, letterSpacing: -0.3 },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekHead: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.2857%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.md, position: "relative" },
  cellEmpty: { width: "14.2857%", aspectRatio: 1 },
  cellPast: { opacity: 0.3 },
  cellBlocked: { backgroundColor: "rgba(255,107,107,0.08)", borderWidth: 1, borderColor: "rgba(255,107,107,0.3)" },
  cellSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  cellText: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  cellTextPast: { color: colors.textMuted },
  cellTextBlocked: { color: colors.error },
  cellTextSelected: { color: "#000", fontFamily: fonts.bodyBold },
  blockedDot: { position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.error },
  legend: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  lDot: { width: 8, height: 8, borderRadius: 4 },
  lText: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  outlineBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong },
  outlineBtnText: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  solidBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.full, backgroundColor: colors.primary },
  solidBtnText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  hint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: spacing.md, textAlign: "center", lineHeight: 18 },
});

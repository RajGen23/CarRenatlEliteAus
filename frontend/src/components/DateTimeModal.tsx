import React, { useMemo, useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing } from "@/src/theme";

type Props = {
  visible: boolean;
  title?: string;
  value: Date;
  minDate?: Date;
  onCancel: () => void;
  onConfirm: (d: Date) => void;
};

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function buildMonthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const lead = first.getDay();
  const total = last.getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = [0, 15, 30, 45];

export function DateTimeModal({
  visible,
  title = "Select date & time",
  value,
  minDate,
  onCancel,
  onConfirm,
}: Props) {
  const [cursor, setCursor] = useState<Date>(value);
  const [picked, setPicked] = useState<Date>(value);

  useEffect(() => {
    if (visible) {
      setCursor(value);
      setPicked(value);
    }
  }, [visible, value]);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
  const minStartOfDay = minDate ? startOfDay(minDate) : null;

  const setDatePart = (d: Date) => {
    const next = new Date(picked);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setPicked(next);
  };

  const setHourPart = (h: number) => {
    const next = new Date(picked);
    const isPm = next.getHours() >= 12;
    next.setHours((h % 12) + (isPm ? 12 : 0));
    setPicked(next);
  };

  const setMinutePart = (m: number) => {
    const next = new Date(picked);
    next.setMinutes(m, 0, 0);
    setPicked(next);
  };

  const togglePM = (toPm: boolean) => {
    const next = new Date(picked);
    const h = next.getHours();
    if (toPm && h < 12) next.setHours(h + 12);
    else if (!toPm && h >= 12) next.setHours(h - 12);
    setPicked(next);
  };

  const currentHour12 = picked.getHours() % 12 === 0 ? 12 : picked.getHours() % 12;
  const currentMin = picked.getMinutes();
  const isPm = picked.getHours() >= 12;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="datetime-modal">
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable testID="dt-close" onPress={onCancel} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.previewChip}>
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Text style={styles.previewText}>
              {picked.toLocaleString("en-AU", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>

          <View style={styles.monthRow}>
            <Pressable
              testID="dt-prev-month"
              onPress={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
              style={styles.monthBtn}
            >
              <Ionicons name="chevron-back" size={16} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              testID="dt-next-month"
              onPress={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
              style={styles.monthBtn}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <Text key={i} style={styles.weekHead}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((d, idx) => {
              if (!d) return <View key={idx} style={styles.cellEmpty} />;
              const isPast = minStartOfDay ? d < minStartOfDay : false;
              const isPicked =
                d.getFullYear() === picked.getFullYear() &&
                d.getMonth() === picked.getMonth() &&
                d.getDate() === picked.getDate();
              return (
                <Pressable
                  key={idx}
                  testID={`dt-day-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`}
                  disabled={isPast}
                  onPress={() => setDatePart(d)}
                  style={[styles.cell, isPicked && styles.cellPicked, isPast && styles.cellPast]}
                >
                  <Text
                    style={[
                      styles.cellText,
                      isPicked && styles.cellTextPicked,
                      isPast && styles.cellTextPast,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timeWrap}>
            <Text style={styles.timeLabel}>TIME</Text>
            <View style={styles.timeRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingRight: 8 }}
              >
                {HOURS.map((h) => {
                  const active = h === currentHour12;
                  return (
                    <Pressable
                      key={h}
                      testID={`dt-hour-${h}`}
                      onPress={() => setHourPart(h)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{h}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={[styles.timeRow, { marginTop: 6 }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingRight: 8 }}
              >
                {MINUTES.map((m) => {
                  const active = m === currentMin;
                  return (
                    <Pressable
                      key={m}
                      testID={`dt-min-${m}`}
                      onPress={() => setMinutePart(m)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        :{String(m).padStart(2, "0")}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  testID="dt-am"
                  onPress={() => togglePM(false)}
                  style={[styles.chip, !isPm && styles.chipActive, { marginLeft: 8 }]}
                >
                  <Text style={[styles.chipText, !isPm && styles.chipTextActive]}>AM</Text>
                </Pressable>
                <Pressable
                  testID="dt-pm"
                  onPress={() => togglePM(true)}
                  style={[styles.chip, isPm && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isPm && styles.chipTextActive]}>PM</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              testID="dt-cancel"
              onPress={onCancel}
              style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="dt-confirm"
              onPress={() => onConfirm(picked)}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.btnPrimaryText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.displayMedium, letterSpacing: -0.3 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  previewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(212,175,55,0.08)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  previewText: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 12 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  monthBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 15 },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekHead: {
    flex: 1,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: fonts.bodyBold,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  cellEmpty: { width: "14.2857%", aspectRatio: 1 },
  cellPicked: { backgroundColor: colors.primary },
  cellPast: { opacity: 0.3 },
  cellText: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  cellTextPicked: { color: "#000", fontFamily: fonts.bodyBold },
  cellTextPast: { color: colors.textMuted },
  timeWrap: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  timeLabel: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: fonts.bodyBold,
    marginBottom: 6,
  },
  timeRow: { flexDirection: "row" },
  chip: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontFamily: fonts.bodyMedium, fontSize: 12 },
  chipTextActive: { color: "#000", fontFamily: fonts.bodyBold },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, paddingVertical: 14, borderRadius: radius.full, alignItems: "center" },
  btnSecondary: { borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
});

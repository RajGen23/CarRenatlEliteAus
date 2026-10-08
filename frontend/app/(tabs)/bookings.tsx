import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Booking } from "@/src/types";
import { useAuth } from "@/src/AuthContext";
import { notify } from "@/src/utils/dialog";

const TABS = ["pending", "upcoming", "completed", "cancelled"] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  pending: "Requests",
  upcoming: "Upcoming",
  completed: "Past",
  cancelled: "Closed",
};

const matchesTab = (status: Booking["status"], tab: (typeof TABS)[number]) =>
  tab === "cancelled" ? status === "cancelled" || status === "declined" : status === tab;

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { refresh: refreshAuth } = useAuth();

  const load = useCallback(async () => {
    try {
      const data = await api.get<Booking[]>("/bookings");
      setBookings(data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const doCancel = async () => {
    if (!pending) return;
    setCancelling(true);
    const b = pending;
    const wasRequest = b.status === "pending";
    try {
      await api.post(`/bookings/${b.booking_id}/cancel`);
      setPending(null);
      await load();
      await refreshAuth();
      notify(
        wasRequest ? "Request withdrawn" : "Booking cancelled",
        wasRequest
          ? "Your request was withdrawn. Nothing was charged."
          : `$${(b.total * 0.8).toFixed(2)} refunded to your wallet.`
      );
    } catch (e: any) {
      notify("Error", e.message);
    } finally {
      setCancelling(false);
    }
  };

  const filtered = bookings.filter((b) => matchesTab(b.status, tab));

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Screen>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>RESERVATIONS</Text>
        <Text style={styles.title}>Your Bookings</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = tab === t;
          const count = bookings.filter((b) => matchesTab(b.status, t)).length;
          return (
            <Pressable
              key={t}
              testID={`tab-${t}`}
              onPress={() => setTab(t)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {TAB_LABELS[t]} {count > 0 && <Text style={styles.tabCount}>({count})</Text>}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120, paddingTop: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        testID="bookings-list"
      >
        {filtered.map((b) => (
          <View key={b.booking_id} style={styles.card} testID={`booking-${b.booking_id}`}>
            <View style={styles.cardHeader}>
              <Image source={{ uri: b.car_image }} style={styles.carImg} />
              <View style={styles.cardHeaderInfo}>
                <Text style={styles.carBrand} numberOfLines={1}>
                  {b.car_brand.toUpperCase()}
                </Text>
                <Text style={styles.carModel} numberOfLines={1} ellipsizeMode="tail">
                  {b.car_model}
                </Text>
                <Text style={styles.bookingId} numberOfLines={1}>
                  #{b.booking_id.slice(-6).toUpperCase()}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  b.status === "pending" && styles.statusPending,
                  b.status === "completed" && styles.statusCompleted,
                  (b.status === "cancelled" || b.status === "declined") && styles.statusCancelled,
                ]}
              >
                <Text style={styles.statusText} numberOfLines={1}>
                  {b.status === "pending" ? "awaiting" : b.status}
                </Text>
              </View>
            </View>

            {b.status === "pending" && (
              <View style={styles.infoStrip}>
                <Ionicons name="hourglass-outline" size={13} color={colors.warning} />
                <Text style={styles.infoStripText}>
                  Waiting on host approval · they have 24 hours to respond
                </Text>
              </View>
            )}

            {b.status === "declined" && (
              <View style={[styles.infoStrip, styles.infoStripError]}>
                <Ionicons name="close-circle-outline" size={13} color={colors.error} />
                <Text style={[styles.infoStripText, { color: colors.textSecondary }]}>
                  Declined · {b.decline_reason ?? "No reason given"}
                  {b.decline_note ? ` — "${b.decline_note}"` : ""}
                </Text>
              </View>
            )}

            <View style={styles.timeline}>
              <View style={styles.timelineItem}>
                <Ionicons name="navigate-circle" size={14} color={colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeLabel}>PICKUP</Text>
                  <Text style={styles.timeLoc} numberOfLines={1}>{b.pickup_location}</Text>
                  <Text style={styles.timeDate}>{formatDate(b.pickup_datetime)}</Text>
                </View>
              </View>
              <View style={styles.timelineConnector} />
              <View style={styles.timelineItem}>
                <Ionicons name="flag" size={14} color={colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeLabel}>DROP</Text>
                  <Text style={styles.timeLoc} numberOfLines={1}>{b.drop_location}</Text>
                  <Text style={styles.timeDate}>{formatDate(b.drop_datetime)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <View>
                <Text style={styles.totalLabel}>Total · {b.days} {b.days === 1 ? "day" : "days"}</Text>
                <Text style={styles.totalVal}>${b.total.toFixed(2)}</Text>
              </View>
              {(b.status === "upcoming" || b.status === "pending") && (
                <Pressable
                  testID={`cancel-${b.booking_id}`}
                  onPress={() => setPending(b)}
                  style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.cancelText}>{b.status === "pending" ? "Withdraw" : "Cancel"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {tab === "pending" ? "No pending requests" : `No ${TAB_LABELS[tab].toLowerCase()} bookings yet`}
            </Text>
          </View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={!!pending}
        title={pending?.status === "pending" ? "Withdraw request?" : "Cancel reservation?"}
        message={
          !pending
            ? ""
            : pending.status === "pending"
              ? "Your host will no longer see this request. Nothing has been charged."
              : `You'll receive a refund of $${(pending.total * 0.8).toFixed(2)} (80%) to your wallet.`
        }
        confirmLabel={
          cancelling
            ? "Working…"
            : pending?.status === "pending"
              ? "Withdraw request"
              : "Cancel booking"
        }
        cancelLabel="Keep it"
        destructive
        onConfirm={doCancel}
        onCancel={() => !cancelling && setPending(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  tabs: {
    flexDirection: "row",
    gap: 0,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: 2, alignItems: "center", justifyContent: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, lineHeight: 14 },
  tabTextActive: { color: colors.textPrimary },
  tabCount: { color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  cardHeaderInfo: { flex: 1, minWidth: 0, flexShrink: 1 },
  carImg: { width: 80, height: 60, borderRadius: radius.md, backgroundColor: "#000", flexShrink: 0 },
  carBrand: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  carModel: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium, marginTop: 2 },
  bookingId: { color: colors.textMuted, fontSize: 10, letterSpacing: 1, fontFamily: fonts.body, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexShrink: 0,
    alignSelf: "flex-start",
    maxWidth: 96,
  },
  statusCompleted: { borderColor: "rgba(124,227,166,0.35)", backgroundColor: "rgba(124,227,166,0.08)" },
  statusPending: { borderColor: "rgba(240,183,60,0.4)", backgroundColor: "rgba(240,183,60,0.1)" },
  statusCancelled: { borderColor: "rgba(255,107,107,0.35)", backgroundColor: "rgba(255,107,107,0.08)" },
  infoStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(240,183,60,0.3)",
    backgroundColor: "rgba(240,183,60,0.06)",
  },
  infoStripError: { borderColor: "rgba(255,107,107,0.3)", backgroundColor: "rgba(255,107,107,0.06)" },
  infoStripText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 16 },
  statusText: { color: colors.textPrimary, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold, textTransform: "uppercase" },
  timeline: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  timelineItem: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  timelineConnector: { width: 1, height: 16, backgroundColor: colors.border, marginLeft: 7, marginVertical: 4 },
  timeLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  timeLoc: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bodyMedium, marginTop: 2 },
  timeDate: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, marginTop: 1 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  totalVal: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.displayMedium, marginTop: 2 },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.4)",
    backgroundColor: "rgba(255,107,107,0.08)",
  },
  cancelText: { color: colors.error, fontSize: 12, fontFamily: fonts.bodyBold, letterSpacing: 1 },
  empty: { alignItems: "center", marginTop: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontFamily: fonts.body },
});

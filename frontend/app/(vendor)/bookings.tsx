import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Booking } from "@/src/types";

type VBooking = Booking & {
  customer_name: string;
  customer_email: string;
  customer_picture?: string | null;
  commission: number;
  net: number;
};

const TABS = ["upcoming", "completed", "cancelled"] as const;

export default function VendorBookings() {
  const [bookings, setBookings] = useState<VBooking[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("upcoming");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<VBooking[]>("/vendor/bookings");
      setBookings(data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = bookings.filter((b) =>
    tab === "cancelled" ? b.status === "cancelled" || b.status === "declined" : b.status === tab
  );

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>INBOX</Text>
        <Text style={styles.title}>Reservations</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = tab === t;
          const count = bookings.filter((b) =>
            t === "cancelled" ? b.status === "cancelled" || b.status === "declined" : b.status === t
          ).length;
          return (
            <Pressable key={t} testID={`v-tab-${t}`} onPress={() => setTab(t)} style={[styles.tab, active && styles.tabActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t} {count > 0 && <Text style={styles.tabCount}>({count})</Text>}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, paddingTop: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No {tab} reservations</Text>
          </View>
        ) : (
          filtered.map((b) => (
            <View key={b.booking_id} style={styles.card} testID={`v-booking-${b.booking_id}`}>
              <View style={styles.carRow}>
                <Image source={{ uri: b.car_image }} style={styles.carImg} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.carBrand}>{b.car_brand.toUpperCase()}</Text>
                  <Text style={styles.carModel}>{b.car_model}</Text>
                  <Text style={styles.bookingId}>#{b.booking_id.slice(-6).toUpperCase()}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    b.status === "completed" && styles.statusCompleted,
                    (b.status === "cancelled" || b.status === "declined") && styles.statusCancelled,
                  ]}
                >
                  <Text style={styles.statusText}>{b.status}</Text>
                </View>
              </View>

              <View style={styles.customerRow}>
                {b.customer_picture ? (
                  <Image source={{ uri: b.customer_picture }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInit}>{b.customer_name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.custName}>{b.customer_name}</Text>
                  <Text style={styles.custEmail} numberOfLines={1}>{b.customer_email}</Text>
                </View>
              </View>

              <View style={styles.timeline}>
                <View style={styles.timeRow}>
                  <Ionicons name="navigate-circle" size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timeLabel}>PICKUP</Text>
                    <Text style={styles.timeLoc} numberOfLines={1}>{b.pickup_location}</Text>
                    <Text style={styles.timeDate}>{fmt(b.pickup_datetime)}</Text>
                  </View>
                </View>
                <View style={styles.tConn} />
                <View style={styles.timeRow}>
                  <Ionicons name="flag" size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timeLabel}>DROP</Text>
                    <Text style={styles.timeLoc} numberOfLines={1}>{b.drop_location}</Text>
                    <Text style={styles.timeDate}>{fmt(b.drop_datetime)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.money}>
                <View style={styles.moneyCell}>
                  <Text style={styles.moneyLabel}>GROSS</Text>
                  <Text style={styles.moneyVal}>${b.total.toFixed(2)}</Text>
                </View>
                <View style={styles.moneyCell}>
                  <Text style={styles.moneyLabel}>FEE 15%</Text>
                  <Text style={[styles.moneyVal, { color: colors.textMuted }]}>−${b.commission.toFixed(2)}</Text>
                </View>
                <View style={styles.moneyCell}>
                  <Text style={styles.moneyLabel}>YOU EARN</Text>
                  <Text style={[styles.moneyVal, { color: colors.primary }]}>${b.net.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  tabs: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.lg, borderBottomWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 },
  tabTextActive: { color: colors.textPrimary },
  tabCount: { color: colors.textMuted },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md,
  },
  carRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  carImg: { width: 76, height: 56, borderRadius: radius.md },
  carBrand: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  carModel: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, marginTop: 2 },
  bookingId: { color: colors.textMuted, fontSize: 10, letterSpacing: 1, fontFamily: fonts.body, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong },
  statusCompleted: { borderColor: "rgba(124,227,166,0.35)", backgroundColor: "rgba(124,227,166,0.08)" },
  statusCancelled: { borderColor: "rgba(255,107,107,0.35)", backgroundColor: "rgba(255,107,107,0.08)" },
  statusText: { color: colors.textPrimary, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold, textTransform: "uppercase" },
  customerRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  avatarInit: { color: colors.primary, fontFamily: fonts.displayMedium, fontSize: 13 },
  custName: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bodyMedium },
  custEmail: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 1 },
  timeline: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  timeRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  tConn: { width: 1, height: 14, backgroundColor: colors.border, marginLeft: 7, marginVertical: 4 },
  timeLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  timeLoc: { color: colors.textPrimary, fontSize: 12, fontFamily: fonts.bodyMedium, marginTop: 2 },
  timeDate: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, marginTop: 1 },
  money: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  moneyCell: { flex: 1, alignItems: "flex-start" },
  moneyLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  moneyVal: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 80, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
});

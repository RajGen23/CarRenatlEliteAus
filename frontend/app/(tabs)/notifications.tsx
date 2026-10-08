import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Booking } from "@/src/types";
import { storage } from "@/src/utils/storage";

type Notif = {
  id: string;
  type: "booking_confirmed" | "booking_cancelled" | "booking_pending" | "booking_declined" | "promo" | "system" | "welcome";
  title: string;
  body: string;
  ts: number; // ms
  read?: boolean;
  href?: string;
};

const READ_KEY = "elitereserve_notif_read";

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const STATIC_PROMOS: Notif[] = [
  {
    id: "promo_vip30",
    type: "promo",
    title: "VIP30 — Save 30% this week",
    body: "Apply code VIP30 at checkout for 30% off your next reservation. Valid on all vehicles.",
    ts: Date.now() - 1000 * 60 * 60 * 6,
  },
  {
    id: "promo_weekend",
    type: "promo",
    title: "Weekend escape",
    body: "Hire a Range Rover Autobiography for Mornington Peninsula — 20% off with WEEKEND20.",
    ts: Date.now() - 1000 * 60 * 60 * 28,
  },
];

const WELCOME: Notif = {
  id: "welcome_001",
  type: "welcome",
  title: "Welcome to EliteReserve",
  body: "Your $5,000 wallet bonus has been credited. Reserve any car instantly.",
  ts: Date.now() - 1000 * 60 * 60 * 24 * 2,
};

export default function Notifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [readSet, setReadSet] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const bookings = await api.get<Booking[]>("/bookings");
      const fromBookings: Notif[] = bookings.flatMap((b) => {
        const created = new Date(b.created_at).getTime();
        const base: Notif[] = [
          {
            id: `bk_req_${b.booking_id}`,
            type: "booking_pending",
            title: `Request sent · ${b.car_brand} ${b.car_model}`,
            body: `Awaiting host approval. They have 24 hours to accept — you're charged only if they do.`,
            ts: created,
            href: "/(tabs)/bookings",
          },
        ];
        if (b.status === "upcoming" || b.status === "completed") {
          base.push({
            id: `bk_conf_${b.booking_id}`,
            type: "booking_confirmed",
            title: `Host accepted · ${b.car_brand} ${b.car_model}`,
            body: `Pickup ${new Date(b.pickup_datetime).toLocaleDateString("en-AU", { month: "short", day: "numeric" })} at ${b.pickup_location}. Charged $${b.total.toFixed(2)}.`,
            ts: created + 1000,
            href: "/(tabs)/bookings",
          });
        }
        if (b.status === "declined") {
          base.push({
            id: `bk_dec_${b.booking_id}`,
            type: "booking_declined",
            title: `Request declined · ${b.car_brand} ${b.car_model}`,
            body: `${b.decline_reason ?? "The host declined your request"}${b.decline_note ? ` — "${b.decline_note}"` : ""}. Nothing was charged.`,
            ts: created + 1000,
            href: "/(tabs)/bookings",
          });
        }
        if (b.status === "cancelled") {
          base.push({
            id: `bk_canc_${b.booking_id}`,
            type: "booking_cancelled",
            title: `Reservation cancelled · ${b.car_brand} ${b.car_model}`,
            body: `Refund of $${(b.total * 0.8).toFixed(2)} credited to your wallet.`,
            ts: created + 2000,
            href: "/(tabs)/bookings",
          });
        }
        return base;
      });

      const merged = [WELCOME, ...STATIC_PROMOS, ...fromBookings].sort((a, b) => b.ts - a.ts);
      const stored = await storage.getItem<string>(READ_KEY, "[]");
      setReadSet(new Set<string>(JSON.parse(stored ?? "[]")));
      setItems(merged);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    // mark all read on view
    if (items.length === 0) return;
    const ids = items.map((i) => i.id);
    storage.setItem(READ_KEY, JSON.stringify(ids));
    setReadSet(new Set(ids));
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const iconFor = (t: Notif["type"]): keyof typeof Ionicons.glyphMap => {
    switch (t) {
      case "booking_confirmed":
        return "checkmark-circle";
      case "booking_cancelled":
        return "close-circle";
      case "booking_pending":
        return "hourglass";
      case "booking_declined":
        return "close-circle";
      case "promo":
        return "pricetag";
      case "welcome":
        return "sparkles";
      default:
        return "notifications";
    }
  };

  return (
    <Screen>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>INBOX</Text>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120, paddingTop: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        testID="notifications-list"
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>You&apos;re all caught up</Text>
            <Text style={styles.emptySub}>Booking updates and offers will appear here.</Text>
          </View>
        ) : (
          items.map((n) => (
            <Pressable
              key={n.id}
              testID={`notif-${n.id}`}
              onPress={() => n.href && router.push(n.href as any)}
              style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <View
                style={[
                  styles.iconWrap,
                  n.type === "booking_cancelled" && { borderColor: "rgba(255,107,107,0.4)" },
                  n.type === "booking_declined" && { borderColor: "rgba(255,107,107,0.4)" },
                  n.type === "promo" && { borderColor: colors.borderStrong, backgroundColor: "rgba(212,175,55,0.08)" },
                ]}
              >
                <Ionicons
                  name={iconFor(n.type)}
                  size={16}
                  color={n.type === "booking_cancelled" || n.type === "booking_declined" ? colors.error : colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.row}>
                  <Text style={styles.notifTitle} numberOfLines={1}>
                    {n.title}
                  </Text>
                  <Text style={styles.notifTime}>{timeAgo(n.ts)}</Text>
                </View>
                <Text style={styles.notifBody} numberOfLines={2}>
                  {n.body}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  notifTitle: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13, flex: 1, paddingRight: spacing.sm },
  notifTime: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.body },
  notifBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontFamily: fonts.body, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 80, gap: spacing.sm },
  emptyText: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 20, marginTop: spacing.md },
  emptySub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
});

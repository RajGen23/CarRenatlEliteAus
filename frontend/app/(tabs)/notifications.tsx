import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { useAppConfig } from "@/src/appConfig";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Booking } from "@/src/types";
import { storage } from "@/src/utils/storage";

type Notif = {
  id: string;
  type: "booking_confirmed" | "booking_cancelled" | "booking_pending" | "booking_declined" | "system" | "welcome";
  title: string;
  body: string;
  ts: number;
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

type Offer = { code: string; discount_pct: number; description: string };

const ts = (iso?: string | null, fallback = 0) => (iso ? new Date(iso).getTime() : fallback);
const short = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { month: "short", day: "numeric" });

function bookingNotifications(b: Booking): Notif[] {
  const created = ts(b.created_at);
  const car = `${b.car_brand} ${b.car_model}`;
  const items: Notif[] = [
    {
      id: `bk_req_${b.booking_id}`,
      type: "booking_pending",
      title: `Request sent · ${car}`,
      body: "Awaiting host approval. They have 24 hours to accept, and you're only charged if they do.",
      ts: created,
      href: "/(tabs)/bookings",
    },
  ];
  if (b.accepted_at || b.status === "upcoming" || b.status === "completed") {
    items.push({
      id: `bk_conf_${b.booking_id}`,
      type: "booking_confirmed",
      title: `Host accepted · ${car}`,
      body: `Pickup ${short(b.pickup_datetime)} at ${b.pickup_location}. Charged $${b.total.toFixed(2)}.`,
      ts: ts(b.accepted_at, created + 1000),
      href: "/(tabs)/bookings",
    });
  }
  if (b.status === "declined") {
    items.push({
      id: `bk_dec_${b.booking_id}`,
      type: "booking_declined",
      title: `Request declined · ${car}`,
      body: `${b.decline_reason ?? "The host declined your request"}${b.decline_note ? ` — "${b.decline_note}"` : ""}. Nothing was charged.`,
      ts: ts(b.responded_at, created + 1000),
      href: "/(tabs)/bookings",
    });
  }
  if (b.status === "cancelled") {
    const refunded = (b.refund ?? 0) + (b.refund_amount ?? 0);
    items.push({
      id: `bk_canc_${b.booking_id}`,
      type: "booking_cancelled",
      title: b.accepted_at || refunded > 0 ? `Reservation cancelled · ${car}` : `Request withdrawn · ${car}`,
      body: refunded > 0 ? `$${refunded.toFixed(2)} was refunded to your wallet.` : "Nothing was charged.",
      ts: ts(b.refunded_at ?? b.cancelled_at, created + 2000),
      href: "/(tabs)/bookings",
    });
  }
  return items;
}

export default function Notifications() {
  const { user } = useAuth();
  const { welcome_credit } = useAppConfig();
  const [items, setItems] = useState<Notif[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [readSet, setReadSet] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bookings, coupons] = await Promise.all([
        api.get<Booking[]>("/bookings"),
        api.get<Offer[]>("/coupons").catch(() => [] as Offer[]),
      ]);
      const welcome: Notif = {
        id: "welcome",
        type: "welcome",
        title: "Welcome to EliteReserve",
        body:
          welcome_credit > 0
            ? `Your $${welcome_credit.toLocaleString("en-AU")} demo wallet credit is ready. Request a car and the host has 24 hours to accept.`
            : "Complete your renter profile, then request any car. Hosts have 24 hours to accept.",
        ts: ts(user?.created_at, 0),
        href: "/renter-profile",
      };
      const merged = [welcome, ...bookings.flatMap(bookingNotifications)].sort((a, b) => b.ts - a.ts);
      const stored = await storage.getItem<string>(READ_KEY, "[]");
      setReadSet(new Set<string>(JSON.parse(stored ?? "[]")));
      setItems(merged);
      setOffers(coupons.slice(0, 3));
    } catch (e) {
      console.warn(e);
    }
  }, [user?.created_at, welcome_credit]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (items.length === 0) return;
    storage.setItem(READ_KEY, JSON.stringify(items.map((i) => i.id)));
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
                  {!readSet.has(n.id) ? <View style={styles.unreadDot} testID={`unread-${n.id}`} /> : null}
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

        {offers.length > 0 ? (
          <View style={styles.offers}>
            <Text style={styles.offersTitle}>CURRENT OFFERS</Text>
            {offers.map((o) => (
              <Pressable
                key={o.code}
                testID={`offer-${o.code}`}
                onPress={() => router.push("/coupons")}
                style={({ pressed }) => [styles.offer, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="pricetag" size={14} color={colors.primary} />
                <Text style={styles.offerCode}>{o.code}</Text>
                <Text style={styles.offerText} numberOfLines={1}>
                  {o.description || `${o.discount_pct}% off`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
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
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 6 },
  offers: { marginTop: spacing.lg },
  offersTitle: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold, marginBottom: spacing.sm },
  offer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  offerCode: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1 },
  offerText: { flex: 1, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 },
  notifBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontFamily: fonts.body, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 80, gap: spacing.sm },
  emptyText: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 20, marginTop: spacing.md },
  emptySub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
});

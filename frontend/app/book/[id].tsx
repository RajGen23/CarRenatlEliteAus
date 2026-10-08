import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/Screen";
import { DateTimeModal } from "@/src/components/DateTimeModal";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Car } from "@/src/types";

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

const formatDateTime = (d: Date) =>
  d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function Book() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const [car, setCar] = useState<Car | null>(null);
  const [pickup, setPickup] = useState("Crown Casino · Southbank, VIC");
  const [drop, setDrop] = useState("Melbourne Airport · Tullamarine");
  const [pickupDate, setPickupDate] = useState<Date>(addDays(new Date(), 1));
  const [dropDate, setDropDate] = useState<Date>(addDays(new Date(), 3));
  const [showPicker, setShowPicker] = useState<null | "pickup" | "drop">(null);
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  // Animated marker for the map preview
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const load = useCallback(async () => {
    try {
      const c = await api.get<Car>(`/cars/${id}`);
      setCar(c);
    } catch (e) {
      console.warn(e);
    }
    try {
      const p = await api.get<{ complete: boolean }>("/profile/renter");
      setProfileComplete(p.complete);
    } catch (e) {
      console.warn(e);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const days = useMemo(() => daysBetween(pickupDate, dropDate), [pickupDate, dropDate]);
  const subtotal = useMemo(() => (car ? car.price_per_day * days : 0), [car, days]);
  const discountAmt = discount?.amount ?? 0;
  const taxes = useMemo(() => Math.round((subtotal - discountAmt) * 0.08 * 100) / 100, [subtotal, discountAmt]);
  const total = useMemo(() => Math.round((subtotal - discountAmt + taxes) * 100) / 100, [subtotal, discountAmt, taxes]);

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    try {
      const res = await api.post<{ code: string; discount: number; description: string }>("/coupons/validate", {
        code: coupon,
        subtotal,
      });
      setDiscount({ code: res.code, amount: res.discount });
    } catch (e: any) {
      Alert.alert("Invalid code", e.message);
      setDiscount(null);
    }
  };

  const onPickDate = (selected: Date) => {
    const which = showPicker;
    setShowPicker(null);
    if (!selected) return;
    if (which === "pickup") {
      setPickupDate(selected);
      if (dropDate <= selected) setDropDate(addDays(selected, 1));
    } else if (which === "drop") {
      if (selected <= pickupDate) {
        Alert.alert("Invalid", "Drop must be after pickup");
        return;
      }
      setDropDate(selected);
    }
  };

  const confirmBooking = async () => {
    if (!car) return;
    if (!pickup.trim() || !drop.trim()) {
      Alert.alert("Required", "Please enter pickup and drop locations");
      return;
    }
    if (profileComplete === false) {
      router.push("/renter-profile");
      return;
    }
    if ((user?.wallet_balance ?? 0) < total) {
      Alert.alert(
        "Insufficient balance",
        `Top up your wallet to complete this booking. Need $${total.toFixed(2)}.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Top up", onPress: () => router.push("/wallet") },
        ]
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ booking_id: string }>("/bookings", {
        car_id: car.car_id,
        pickup_location: pickup,
        drop_location: drop,
        pickup_datetime: pickupDate.toISOString(),
        drop_datetime: dropDate.toISOString(),
        coupon_code: discount?.code ?? undefined,
        payment_method: "wallet",
      });
      await refresh();
      router.replace(`/booking-success?id=${res.booking_id}`);
    } catch (e: any) {
      Alert.alert("Request failed", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!car) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <View style={styles.topBar}>
        <Pressable testID="book-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.topBarEyebrow}>RESERVATION</Text>
          <Text style={styles.topBarTitle}>Review &amp; request</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        <View style={styles.carRow}>
          <Image source={{ uri: car.image }} style={styles.carThumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.carBrand}>{car.brand.toUpperCase()}</Text>
            <Text style={styles.carModel}>{car.model}</Text>
            <Text style={styles.carRate}>${car.price_per_day.toFixed(0)} <Text style={styles.carRateU}>/day</Text></Text>
          </View>
        </View>

        <View style={styles.mapWrap}>
          <View style={styles.mapGrid}>
            {Array.from({ length: 64 }).map((_, i) => (
              <View key={i} style={styles.mapCell} />
            ))}
          </View>
          <View style={styles.mapPath} />
          <View style={[styles.marker, { top: 36, left: 56 }]}>
            <Animated.View
              style={[
                styles.markerPulse,
                {
                  transform: [
                    {
                      scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }),
                    },
                  ],
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                },
              ]}
            />
            <View style={styles.markerDot} />
          </View>
          <View style={[styles.marker, { bottom: 30, right: 50 }]}>
            <View style={[styles.markerDot, { backgroundColor: colors.textPrimary, borderColor: "#000" }]} />
          </View>
          <View style={styles.mapOverlay}>
            <Ionicons name="map-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.mapOverlayText}>ROUTE OVERVIEW</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>PICKUP LOCATION</Text>
          <View style={styles.input}>
            <Ionicons name="navigate-circle-outline" size={16} color={colors.primary} />
            <TextInput
              testID="pickup-input"
              value={pickup}
              onChangeText={setPickup}
              placeholder="Where to collect"
              placeholderTextColor={colors.textMuted}
              style={styles.inputText}
            />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>DROP LOCATION</Text>
          <View style={styles.input}>
            <Ionicons name="flag-outline" size={16} color={colors.primary} />
            <TextInput
              testID="drop-input"
              value={drop}
              onChangeText={setDrop}
              placeholder="Where to return"
              placeholderTextColor={colors.textMuted}
              style={styles.inputText}
            />
          </View>
        </View>

        <View style={[styles.section, { flexDirection: "row", gap: spacing.md }]}>
          <Pressable
            testID="pickup-date-btn"
            onPress={() => setShowPicker("pickup")}
            style={[styles.dateCard, { flex: 1 }]}
          >
            <Text style={styles.label}>PICKUP</Text>
            <Text style={styles.dateValue}>{formatDateTime(pickupDate)}</Text>
            <View style={styles.dateChevron}>
              <Ionicons name="calendar-outline" size={13} color={colors.primary} />
              <Text style={styles.dateChevronText}>Change</Text>
            </View>
          </Pressable>
          <Pressable
            testID="drop-date-btn"
            onPress={() => setShowPicker("drop")}
            style={[styles.dateCard, { flex: 1 }]}
          >
            <Text style={styles.label}>DROP</Text>
            <Text style={styles.dateValue}>{formatDateTime(dropDate)}</Text>
            <View style={styles.dateChevron}>
              <Ionicons name="calendar-outline" size={13} color={colors.primary} />
              <Text style={styles.dateChevronText}>Change</Text>
            </View>
          </Pressable>
        </View>

        <DateTimeModal
          visible={showPicker !== null}
          title={showPicker === "drop" ? "Drop date & time" : "Pickup date & time"}
          value={showPicker === "drop" ? dropDate : pickupDate}
          minDate={showPicker === "drop" ? addDays(pickupDate, 0) : new Date()}
          onCancel={() => setShowPicker(null)}
          onConfirm={onPickDate}
        />

        <View style={styles.section}>
          <Text style={styles.label}>PROMO CODE</Text>
          <View style={[styles.input, { paddingRight: 4 }]}>
            <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
            <TextInput
              testID="coupon-input"
              value={coupon}
              onChangeText={(t) => setCoupon(t.toUpperCase())}
              autoCapitalize="characters"
              placeholder="LUXURY10 · WEEKEND20 · VIP30"
              placeholderTextColor={colors.textMuted}
              style={styles.inputText}
            />
            <Pressable testID="apply-coupon" onPress={applyCoupon} style={styles.applyBtn}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
          {discount && (
            <Text style={styles.discountActive} testID="coupon-active">
              ✓ {discount.code} applied · -${discount.amount.toFixed(2)}
            </Text>
          )}
        </View>

        <View style={[styles.section, styles.summary]}>
          <Text style={styles.summaryTitle}>PRICE BREAKDOWN</Text>
          <SummaryRow label={`Subtotal · ${days} ${days === 1 ? "day" : "days"}`} value={`$${subtotal.toFixed(2)}`} />
          {discountAmt > 0 && (
            <SummaryRow label={`Discount (${discount?.code})`} value={`-$${discountAmt.toFixed(2)}`} accent />
          )}
          <SummaryRow label="Taxes & fees (8%)" value={`$${taxes.toFixed(2)}`} />
          <View style={styles.summaryDivider} />
          <SummaryRow label="TOTAL" value={`$${total.toFixed(2)}`} bold />
        </View>

        <View style={styles.walletPay}>
          <Ionicons name="wallet" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.payMethodTitle}>Wallet payment · charged on approval</Text>
            <Text style={styles.payMethodSub}>Balance: ${(user?.wallet_balance ?? 0).toFixed(2)}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
        </View>

        {profileComplete === false ? (
          <Pressable
            testID="complete-renter-profile"
            onPress={() => router.push("/renter-profile")}
            style={styles.gateCard}
          >
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gateTitle}>Complete your renter verification</Text>
              <Text style={styles.gateSub}>
                Hosts review your licence, address and contact details before approving.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        ) : (
          <View style={styles.approvalCard}>
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.payMethodTitle}>Host approval required</Text>
              <Text style={styles.payMethodSub}>
                The host reviews your profile and has 24 hours to accept. You are only charged once
                they accept.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.xl) }]}>
        <Pressable
          testID="confirm-booking"
          onPress={confirmBooking}
          disabled={submitting}
          style={({ pressed }) => [styles.confirmBtn, (pressed || submitting) && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.confirmText}>
                {profileComplete === false ? "Complete profile to request" : `Request to book · $${total.toFixed(2)}`}
              </Text>
              <Ionicons name={profileComplete === false ? "arrow-forward" : "lock-closed"} size={14} color="#000" />
            </>
          )}
        </Pressable>
        <Text style={styles.bottomNote}>You are not charged until the host accepts</Text>
      </View>
    </Screen>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          bold && { fontFamily: fonts.display, fontSize: 22 },
          accent && { color: colors.success },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarEyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topBarTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  carRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  carThumb: { width: 80, height: 56, borderRadius: radius.md },
  carBrand: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  carModel: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium, marginTop: 2 },
  carRate: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bodyBold, marginTop: 4 },
  carRateU: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body },
  mapWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    height: 160,
    backgroundColor: "#050505",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
    position: "relative",
  },
  mapGrid: { flexDirection: "row", flexWrap: "wrap", position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  mapCell: { width: "12.5%", height: "12.5%", borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: "rgba(255,255,255,0.04)" },
  mapPath: {
    position: "absolute",
    left: 70,
    right: 70,
    top: 50,
    height: 1,
    backgroundColor: colors.borderStrong,
    transform: [{ rotate: "18deg" }],
  },
  marker: { position: "absolute", width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  markerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 2, borderColor: "#000" },
  markerPulse: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary },
  mapOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapOverlayText: { color: colors.textSecondary, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  label: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold, marginBottom: 8 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  inputText: { flex: 1, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14 },
  applyBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  applyText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1 },
  dateCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  dateValue: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 15, marginTop: 4 },
  dateChevron: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  dateChevronText: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 },
  discountActive: { color: colors.success, fontFamily: fonts.bodyMedium, fontSize: 12, marginTop: 8 },
  summary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  summaryTitle: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold, marginBottom: spacing.md },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  summaryLabel: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 },
  summaryValue: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  walletPay: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  payMethodTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bodyMedium },
  payMethodSub: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 2 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
  bottomNote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  approvalCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  gateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(240,183,60,0.08)",
    borderWidth: 1,
    borderColor: "rgba(240,183,60,0.35)",
    padding: spacing.md,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  gateTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bodyMedium },
  gateSub: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, marginTop: 2, lineHeight: 16 },
});

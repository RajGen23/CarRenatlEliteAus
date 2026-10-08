import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Car } from "@/src/types";

export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const [wishlist, setWishlist] = useState<Car[]>([]);
  const [showLogout, setShowLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    try {
      const w = await api.get<Car[]>("/wishlist");
      setWishlist(w);
      await refresh();
    } catch (e) {
      console.warn(e);
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleLogout = () => setShowLogout(true);

  const doLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      setShowLogout(false);
      router.replace("/login");
    }
  }, [logout, signingOut]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.eyebrow}>MEMBER</Text>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.userCard}>
          <View style={styles.avatarWrap}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{user?.name?.[0]?.toUpperCase() ?? "M"}</Text>
              </View>
            )}
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.tier}>
            <Ionicons name="star" size={11} color={colors.primary} />
            <Text style={styles.tierText}>ELITERESERVE MEMBER</Text>
          </View>
        </View>

        <Pressable
          testID="profile-wallet"
          onPress={() => router.push("/wallet")}
          style={styles.walletCard}
        >
          <View>
            <Text style={styles.walletLabel}>WALLET BALANCE</Text>
            <Text style={styles.walletAmt}>${(user?.wallet_balance ?? 0).toFixed(2)}</Text>
          </View>
          <View style={styles.walletAction}>
            <Ionicons name="add" size={18} color="#000" />
            <Text style={styles.walletActionText}>Top up</Text>
          </View>
        </Pressable>

        <Pressable
          testID="become-host-cta"
          onPress={() =>
            router.push(user?.is_vendor ? "/(vendor)/dashboard" : "/vendor/onboarding")
          }
          style={styles.hostCard}
        >
          <View style={styles.hostGlow} />
          <View style={styles.hostContent}>
            <View style={styles.hostBadge}>
              <Ionicons name="sparkles" size={11} color={colors.primary} />
              <Text style={styles.hostBadgeText}>
                {user?.is_vendor ? "HOST PORTAL" : "EARN WITH ELITERESERVE"}
              </Text>
            </View>
            <Text style={styles.hostTitle}>
              {user?.is_vendor ? (
                <>Open your{"\n"}<Text style={styles.hostTitleAccent}>Host Dashboard</Text></>
              ) : (
                <>Become a{"\n"}<Text style={styles.hostTitleAccent}>Host</Text></>
              )}
            </Text>
            <Text style={styles.hostSub}>
              {user?.is_vendor
                ? "Manage your fleet, bookings & earnings"
                : "List your luxury car · earn up to $3,200/wk"}
            </Text>
            <View style={styles.hostFeatures}>
              <HostFeature icon="shield-checkmark-outline" label="Insured" />
              <HostFeature icon="cash-outline" label="85% payout" />
              <HostFeature icon="calendar-outline" label="Flexible" />
            </View>
            <View style={styles.hostCtaRow}>
              <Text style={styles.hostCtaText}>
                {user?.is_vendor ? "Go to dashboard" : "Start hosting"}
              </Text>
              <View style={styles.hostCtaArrow}>
                <Ionicons name="arrow-forward" size={14} color="#000" />
              </View>
            </View>
          </View>
        </Pressable>

        <View style={styles.menuSection}>
          <Pressable
            testID="menu-wishlist"
            onPress={() => router.push("/wishlist")}
            style={styles.menuItem}
          >
            <View style={styles.menuIcon}>
              <Ionicons name="heart-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Wishlist</Text>
              <Text style={styles.menuSub}>{wishlist.length} saved {wishlist.length === 1 ? "car" : "cars"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <Pressable
            testID="menu-renter-profile"
            onPress={() => router.push("/renter-profile")}
            style={styles.menuItem}
          >
            <View style={styles.menuIcon}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Renter Verification</Text>
              <Text style={styles.menuSub}>Licence, address & contact hosts review</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <Pressable
            testID="menu-coupons"
            onPress={() => router.push("/coupons")}
            style={styles.menuItem}
          >
            <View style={styles.menuIcon}>
              <Ionicons name="pricetag-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Promo Codes</Text>
              <Text style={styles.menuSub}>Active luxury offers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <Pressable
            testID="menu-bookings"
            onPress={() => router.push("/(tabs)/bookings")}
            style={styles.menuItem}
          >
            <View style={styles.menuIcon}>
              <Ionicons name="receipt-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Booking History</Text>
              <Text style={styles.menuSub}>Past & upcoming reservations</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Pressable testID="logout-btn" onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={16} color={colors.error} />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <ConfirmModal
        visible={showLogout}
        title="Sign out?"
        message="You'll need to sign in again to make bookings."
        confirmLabel={signingOut ? "Signing out…" : "Sign out"}
        cancelLabel="Stay"
        destructive
        onConfirm={doLogout}
        onCancel={() => setShowLogout(false)}
      />
    </Screen>
  );
}

function HostFeature({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.hostFeature}>
      <Ionicons name={icon} size={12} color={colors.primary} />
      <Text style={styles.hostFeatureText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  userCard: { alignItems: "center", marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  avatarWrap: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, borderColor: colors.borderStrong, padding: 4 },
  avatar: { width: "100%", height: "100%", borderRadius: 44 },
  avatarFallback: { width: "100%", height: "100%", borderRadius: 44, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.textPrimary, fontSize: 36, fontFamily: fonts.display },
  userName: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.displayMedium, marginTop: spacing.md },
  userEmail: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body, marginTop: 4 },
  tier: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  tierText: { color: colors.textPrimary, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  walletCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  walletLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  walletAmt: { color: colors.textPrimary, fontSize: 32, fontFamily: fonts.display, marginTop: 4 },
  walletAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  walletActionText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 12 },
  hostCard: {
    position: "relative",
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    overflow: "hidden",
  },
  hostGlow: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(212,175,55,0.08)",
  },
  hostContent: { gap: spacing.md, position: "relative" },
  hostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(212,175,55,0.06)",
  },
  hostBadgeText: { color: colors.primary, fontSize: 9, letterSpacing: 1.8, fontFamily: fonts.bodyBold },
  hostTitle: { color: colors.textPrimary, fontSize: 26, fontFamily: fonts.display, letterSpacing: -0.5, lineHeight: 30 },
  hostTitleAccent: { color: colors.primary, fontStyle: "italic" },
  hostSub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  hostFeatures: { flexDirection: "row", gap: spacing.md, marginTop: 4 },
  hostFeature: { flexDirection: "row", alignItems: "center", gap: 5 },
  hostFeatureText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 },
  hostCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  hostCtaText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  hostCtaArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  menuSection: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bodyMedium },
  menuSub: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 2 },
  logoutBtn: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 8,
    alignItems: "center",
    marginTop: spacing.xl,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.3)",
  },
  logoutText: { color: colors.error, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
});

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

const LOGO_SOURCE = require("../../assets/images/logo.png");

type Dash = {
  total_vehicles: number;
  upcoming_bookings: number;
  active_rentals: number;
  completed_rentals: number;
  gross_revenue: number;
  commission: number;
  net_earnings: number;
  utilization: number;
  monthly: { label: string; value: number }[];
};

export default function VendorDashboard() {
  const { user, logout, refresh } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Guard: must be onboarded as a vendor
  useEffect(() => {
    if (user && !user.is_vendor) {
      router.replace("/vendor/onboarding");
    }
  }, [user]);

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

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dash>("/vendor/dashboard");
      setData(d);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const maxVal = Math.max(1, ...(data?.monthly.map((m) => m.value) ?? [1]));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.brandHeader}>
          <View style={styles.brandLeft}>
            <Image source={LOGO_SOURCE} style={styles.brandLogo} />
            <View>
              <Text style={styles.brandName}>EliteReserve Hosts</Text>
              <Text style={styles.brandCity}>VENDOR · MELBOURNE</Text>
            </View>
          </View>
          <Pressable
            testID="vendor-logout"
            onPress={() => setShowLogout(true)}
            style={styles.exitBtn}
          >
            <Ionicons name="log-out-outline" size={14} color={colors.error} />
            <Text style={styles.exitTextDestructive}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.greetMuted}>Welcome back, host</Text>
          <Text style={styles.greetName}>
            {user?.name?.split(" ")[0] ?? "Host"}<Text style={styles.greetDot}>.</Text>
          </Text>
        </View>

        <View style={styles.kpiGrid}>
          <KpiCard label="VEHICLES" value={`${data?.total_vehicles ?? 0}`} icon="car-sport-outline" />
          <KpiCard label="UPCOMING" value={`${data?.upcoming_bookings ?? 0}`} icon="calendar-outline" />
          <KpiCard label="ACTIVE" value={`${data?.active_rentals ?? 0}`} icon="navigate-outline" />
          <KpiCard label="UTILIZATION" value={`${data?.utilization ?? 0}%`} icon="pulse-outline" />
        </View>

        <View style={styles.revenueCard}>
          <View style={styles.revenueTop}>
            <Text style={styles.revenueLabel}>NET EARNINGS · ALL TIME</Text>
            <View style={styles.commissionPill}>
              <Text style={styles.commissionText}>15% commission</Text>
            </View>
          </View>
          <Text style={styles.revenueAmount}>${(data?.net_earnings ?? 0).toFixed(2)}</Text>
          <View style={styles.revenueRow}>
            <View style={styles.revenueCell}>
              <Text style={styles.revenueCellLabel}>GROSS</Text>
              <Text style={styles.revenueCellValue}>${(data?.gross_revenue ?? 0).toFixed(0)}</Text>
            </View>
            <View style={styles.cellDiv} />
            <View style={styles.revenueCell}>
              <Text style={styles.revenueCellLabel}>FEES</Text>
              <Text style={styles.revenueCellValue}>${(data?.commission ?? 0).toFixed(0)}</Text>
            </View>
            <View style={styles.cellDiv} />
            <View style={styles.revenueCell}>
              <Text style={styles.revenueCellLabel}>COMPLETED</Text>
              <Text style={styles.revenueCellValue}>{data?.completed_rentals ?? 0}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly earnings</Text>
          <Text style={styles.sectionSub}>Last 6 months · net to your bank</Text>
          <View style={styles.chart}>
            {data?.monthly.map((m, i) => (
              <View key={i} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { height: `${Math.max(4, (m.value / maxVal) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{m.label}</Text>
                <Text style={styles.barValue}>${m.value.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.section, { gap: spacing.sm }]}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <ActionRow
            icon="add-circle-outline"
            title="List a new vehicle"
            sub="Earn from your luxury car within 24h"
            onPress={() => router.push("/vendor/car-form")}
            testID="action-new-car"
          />
          <ActionRow
            icon="cash-outline"
            title="Request payout"
            sub="Transfer to your bank account"
            onPress={() => router.push("/(vendor)/earnings")}
            testID="action-payout"
          />
          <ActionRow
            icon="person-outline"
            title="Edit host profile"
            sub="Company, KYC and bank details"
            onPress={() => router.push("/vendor/profile")}
            testID="action-profile"
          />
          <ActionRow
            icon="log-out-outline"
            title="Sign out"
            sub="End your session"
            onPress={() => setShowLogout(true)}
            testID="action-logout"
            danger
          />
        </View>
      </ScrollView>

      <ConfirmModal
        visible={showLogout}
        title="Sign out?"
        message="You'll need to sign in again to manage your fleet and bookings."
        confirmLabel={signingOut ? "Signing out…" : "Sign out"}
        cancelLabel="Stay"
        destructive
        onConfirm={doLogout}
        onCancel={() => setShowLogout(false)}
      />
    </Screen>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.kpi}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  sub,
  onPress,
  testID,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
  testID?: string;
  danger?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={18} color={danger ? colors.error : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, danger && { color: colors.error }]}>{title}</Text>
        <Text style={styles.actionSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandLogo: { width: 44, height: 44, borderRadius: 22, resizeMode: "cover" },
  brandName: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.displayMedium, letterSpacing: -0.3 },
  brandCity: { color: colors.primary, fontSize: 9, letterSpacing: 3, fontFamily: fonts.bodyBold, marginTop: 1 },
  exitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exitText: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 11 },
  exitTextDestructive: { color: colors.error, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.5 },
  greeting: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  greetMuted: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontFamily: fonts.bodyMedium },
  greetName: { color: colors.textPrimary, fontSize: 28, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 2 },
  greetDot: { color: colors.primary },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  kpiLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  kpiValue: { color: colors.textPrimary, fontSize: 26, fontFamily: fonts.display, letterSpacing: -0.5 },
  revenueCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  revenueTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  revenueLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  commissionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  commissionText: { color: colors.primary, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  revenueAmount: { color: colors.textPrimary, fontSize: 38, fontFamily: fonts.display, letterSpacing: -1 },
  revenueRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  revenueCell: { flex: 1, alignItems: "center" },
  revenueCellLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  revenueCellValue: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium, marginTop: 4 },
  cellDiv: { width: 1, backgroundColor: colors.border },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionTitle: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3 },
  sectionSub: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginTop: 4, marginBottom: spacing.md },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 160, gap: 6, marginTop: spacing.sm },
  barCol: { flex: 1, alignItems: "center", height: "100%" },
  barTrack: {
    width: "70%",
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radius.sm,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: { width: "100%", backgroundColor: colors.primary, borderRadius: radius.sm },
  barLabel: { color: colors.textMuted, fontSize: 10, marginTop: 6, fontFamily: fonts.bodyBold, letterSpacing: 1 },
  barValue: { color: colors.textSecondary, fontSize: 10, fontFamily: fonts.body, marginTop: 1 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 14 },
  actionSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});

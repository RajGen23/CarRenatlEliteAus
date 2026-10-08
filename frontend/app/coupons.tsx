import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Coupon = { code: string; discount_pct: number; description: string };

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  useEffect(() => {
    api.get<Coupon[]>("/coupons").then(setCoupons).catch(() => {});
  }, []);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable testID="coupons-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.topBarEyebrow}>OFFERS</Text>
          <Text style={styles.topBarTitle}>Promo Codes</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={styles.intro}>Apply at checkout for instant savings on any booking.</Text>
        {coupons.map((c) => (
          <View key={c.code} style={styles.couponCard} testID={`coupon-${c.code}`}>
            <View style={styles.couponLeft}>
              <Text style={styles.pct}>{c.discount_pct}%</Text>
              <Text style={styles.off}>OFF</Text>
            </View>
            <View style={styles.divider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.code}>{c.code}</Text>
              <Text style={styles.desc}>{c.description}</Text>
            </View>
            <Ionicons name="ribbon-outline" size={20} color={colors.textMuted} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  topBarEyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topBarTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14, lineHeight: 22, marginBottom: spacing.lg },
  couponCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  couponLeft: { alignItems: "center", minWidth: 60 },
  pct: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, lineHeight: 32 },
  off: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, marginTop: 2 },
  divider: { width: 1, height: 50, backgroundColor: colors.border },
  code: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 2 },
  desc: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
});

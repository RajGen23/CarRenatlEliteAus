import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Car } from "@/src/types";

export function CarCard({ car, testID }: { car: Car; testID?: string }) {
  return (
    <Pressable
      testID={testID ?? `car-card-${car.car_id}`}
      onPress={() => router.push(`/car/${car.car_id}`)}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={styles.imageWrap}>
        <Image source={{ uri: car.image }} style={styles.image} />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.topRow}>
          <View style={[styles.badge, !car.available && styles.badgeUnavail]}>
            <View style={[styles.dot, { backgroundColor: car.available ? colors.success : colors.error }]} />
            <Text style={styles.badgeText}>{car.available ? "Available" : "Booked"}</Text>
          </View>
          <View style={styles.ratingChip}>
            <Ionicons name="star" size={11} color={colors.primary} />
            <Text style={styles.ratingText}>{car.rating.toFixed(1)}</Text>
          </View>
        </View>
        <View style={styles.bottomInfo}>
          <Text style={styles.brand}>{car.brand.toUpperCase()}</Text>
          <Text style={styles.model}>{car.model}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Ionicons name="speedometer-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>{car.horsepower} HP</Text>
        </View>
        <View style={styles.metaDivider} />
        <View style={styles.metaItem}>
          <Ionicons name="flash-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>{car.fuel_type}</Text>
        </View>
        <View style={styles.metaDivider} />
        <View style={styles.metaItem}>
          <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>{car.seats}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={styles.price}>
          <Text style={styles.priceCurrency}>$</Text>
          {car.price_per_day.toFixed(0)}
          <Text style={styles.priceUnit}> /day</Text>
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  imageWrap: {
    width: "100%",
    height: 220,
    position: "relative",
  },
  image: { width: "100%", height: "100%" },
  topRow: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    gap: 6,
  },
  badgeUnavail: { borderColor: "rgba(255,107,107,0.4)" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { color: colors.textPrimary, fontSize: 11, fontFamily: fonts.bodyMedium, letterSpacing: 0.4 },
  ratingChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    gap: 4,
  },
  ratingText: { color: colors.textPrimary, fontSize: 11, fontFamily: fonts.bodyMedium },
  bottomInfo: {
    position: "absolute",
    left: spacing.lg,
    bottom: spacing.md,
  },
  brand: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: fonts.bodyBold,
    marginBottom: 2,
  },
  model: {
    color: colors.textPrimary,
    fontSize: 22,
    fontFamily: fonts.displayMedium,
    letterSpacing: -0.3,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaDivider: { width: 1, height: 12, backgroundColor: colors.border },
  metaText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body },
  price: { color: colors.textPrimary, fontSize: 20, fontFamily: fonts.displayMedium },
  priceCurrency: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.bodyMedium },
  priceUnit: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body },
});

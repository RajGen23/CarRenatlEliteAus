import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image, RefreshControl, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Car } from "@/src/types";

export default function VendorFleet() {
  const [cars, setCars] = useState<Car[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [toDelete, setToDelete] = useState<Car | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Car[]>("/vendor/cars");
      setCars(data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onDelete = async () => {
    if (!toDelete) return;
    try {
      await api.del(`/vendor/cars/${toDelete.car_id}`);
      setToDelete(null);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR FLEET</Text>
          <Text style={styles.title}>Vehicles</Text>
        </View>
        <Pressable
          testID="new-vehicle-btn"
          onPress={() => router.push("/vendor/car-form")}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={18} color="#000" />
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        testID="fleet-list"
      >
        {cars.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="car-sport-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No vehicles listed yet</Text>
            <Text style={styles.emptySub}>Add your first luxury car and start earning within 24 hours.</Text>
            <Pressable
              testID="empty-add"
              onPress={() => router.push("/vendor/car-form")}
              style={styles.emptyCta}
            >
              <Text style={styles.emptyCtaText}>List a vehicle</Text>
              <Ionicons name="arrow-forward" size={14} color="#000" />
            </Pressable>
          </View>
        ) : (
          cars.map((c) => (
            <View key={c.car_id} style={styles.card} testID={`fleet-car-${c.car_id}`}>
              <Image source={{ uri: c.image }} style={styles.img} />
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={styles.brand}>{c.brand.toUpperCase()}</Text>
                  <View style={[styles.statusDot, { backgroundColor: c.available ? colors.success : colors.error }]} />
                </View>
                <Text style={styles.model}>{c.model}</Text>
                <View style={styles.meta}>
                  <Text style={styles.metaItem}>{c.category}</Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaItem}>{c.fuel_type}</Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaItem}>{c.seats} seats</Text>
                </View>
                <View style={styles.bottomRow}>
                  <Text style={styles.price}>
                    ${c.price_per_day.toFixed(0)}<Text style={styles.priceUnit}>/day</Text>
                  </Text>
                  <View style={styles.actions}>
                    <Pressable
                      testID={`edit-${c.car_id}`}
                      onPress={() => router.push(`/vendor/car-form?id=${c.car_id}`)}
                      style={styles.actionBtn}
                    >
                      <Ionicons name="create-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      testID={`calendar-${c.car_id}`}
                      onPress={() => router.push(`/vendor/calendar?id=${c.car_id}`)}
                      style={styles.actionBtn}
                    >
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      testID={`del-${c.car_id}`}
                      onPress={() => setToDelete(c)}
                      style={[styles.actionBtn, { borderColor: "rgba(255,107,107,0.4)" }]}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ConfirmModal
        visible={!!toDelete}
        title="Delete this vehicle?"
        message={
          toDelete
            ? `${toDelete.brand} ${toDelete.model} will be permanently removed from your fleet. Existing bookings remain.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={onDelete}
        onCancel={() => setToDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  addText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1 },
  empty: { alignItems: "center", marginTop: 60, gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 20, marginTop: spacing.md },
  emptySub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, textAlign: "center", marginBottom: spacing.lg },
  emptyCta: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 14, borderRadius: radius.full,
  },
  emptyCtaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  img: { width: 110, height: "100%" },
  body: { flex: 1, padding: spacing.md, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  model: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, letterSpacing: -0.3 },
  meta: { flexDirection: "row", gap: 6, marginTop: 2, alignItems: "center" },
  metaItem: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body },
  metaDot: { color: colors.textMuted, fontSize: 11 },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  price: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.display },
  priceUnit: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body },
  actions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
});

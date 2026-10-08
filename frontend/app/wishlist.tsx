import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { CarCard } from "@/src/components/CarCard";
import { api } from "@/src/api";
import { colors, fonts, spacing } from "@/src/theme";
import type { Car } from "@/src/types";

export default function Wishlist() {
  const [cars, setCars] = useState<Car[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Car[]>("/wishlist");
      setCars(data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable testID="wishlist-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.topBarEyebrow}>SAVED</Text>
          <Text style={styles.topBarTitle}>Wishlist</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {cars.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No favourites yet</Text>
            <Text style={styles.emptySub}>Tap the heart on any car to save it here.</Text>
          </View>
        ) : (
          cars.map((c) => <CarCard key={c.car_id} car={c} />)
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
  },
  topBarEyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topBarTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  empty: { alignItems: "center", marginTop: 80, gap: spacing.sm },
  emptyText: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 20, marginTop: spacing.md },
  emptySub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
});

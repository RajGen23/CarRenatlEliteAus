import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { CarCard } from "@/src/components/CarCard";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Car } from "@/src/types";

const CATEGORIES = ["All", "Sports", "Luxury", "SUV", "Sedan"] as const;
const SORTS = [
  { key: "default", label: "Default" },
  { key: "price_asc", label: "Price ↑" },
  { key: "price_desc", label: "Price ↓" },
  { key: "rating", label: "Rating" },
] as const;

export default function Cars() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [search, setSearch] = useState(params.q ?? "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("default");
  const [cars, setCars] = useState<Car[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (category !== "All") qs.append("category", category);
    if (search.trim()) qs.append("search", search.trim());
    if (sort !== "default") qs.append("sort", sort);
    try {
      const data = await api.get<Car[]>(`/cars?${qs.toString()}`);
      setCars(data);
    } catch (e) {
      console.warn(e);
    }
  }, [category, search, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <Screen>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>THE FLEET</Text>
        <Text style={styles.title}>Browse Collection</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          testID="cars-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search brand or model..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} testID="search-clear">
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.pills}
      >
        {CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <Pressable
              key={c}
              testID={`filter-cat-${c}`}
              onPress={() => setCategory(c)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.sortPills}
      >
        <View style={styles.sortLabel}>
          <Ionicons name="funnel-outline" size={12} color={colors.textMuted} />
          <Text style={styles.sortLabelText}>SORT</Text>
        </View>
        {SORTS.map((s) => {
          const active = sort === s.key;
          return (
            <Pressable
              key={s.key}
              testID={`sort-${s.key}`}
              onPress={() => setSort(s.key)}
              style={[styles.sortPill, active && styles.sortPillActive]}
            >
              <Text style={[styles.sortText, active && styles.sortTextActive]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120, paddingTop: spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.resultsCount} testID="results-count">
          {cars.length} {cars.length === 1 ? "vehicle" : "vehicles"}
        </Text>
        {cars.map((c) => (
          <CarCard key={c.car_id} car={c} />
        ))}
        {cars.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="car-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No vehicles match your search</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 50,
    borderRadius: radius.full,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14 },
  pills: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: spacing.md, alignItems: "center" },
  filterRow: { flexGrow: 0, flexShrink: 0 },
  pill: {
    paddingHorizontal: 18,
    height: 38,
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  pillTextActive: { color: "#000" },
  sortPills: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 8, alignItems: "center" },
  sortLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 4 },
  sortLabelText: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold },
  sortPill: {
    paddingHorizontal: 14,
    height: 32,
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: { borderColor: colors.primary, backgroundColor: "rgba(255,255,255,0.08)" },
  sortText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  sortTextActive: { color: colors.textPrimary, fontFamily: fonts.bodyMedium },
  resultsCount: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontFamily: fonts.bodyBold, marginBottom: spacing.md },
  empty: { alignItems: "center", marginTop: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontFamily: fonts.body },
});

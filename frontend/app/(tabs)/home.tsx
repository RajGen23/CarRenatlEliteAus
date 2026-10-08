import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { CarCard } from "@/src/components/CarCard";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Car } from "@/src/types";

const LOGO_SOURCE = require("../../assets/images/logo.png");

const BANNER_H = 380;

const CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "All", label: "All", icon: "apps-outline" },
  { key: "Sports", label: "Sports", icon: "flash-outline" },
  { key: "Luxury", label: "Luxury", icon: "diamond-outline" },
  { key: "SUV", label: "SUV", icon: "car-outline" },
  { key: "Sedan", label: "Sedan", icon: "car-sport-outline" },
];

export default function Home() {
  const { user } = useAuth();
  const [featured, setFeatured] = useState<Car[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [bannerWidth, setBannerWidth] = useState(0);
  const bannerRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [f, allCars] = await Promise.all([
        api.get<Car[]>("/cars/featured"),
        api.get<Car[]>(`/cars${category !== "All" ? `?category=${category}` : ""}`),
      ]);
      setFeatured(f);
      setCars(allCars);
    } catch (e) {
      console.warn("load home", e);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  // auto-advance banner
  useEffect(() => {
    if (featured.length < 2 || bannerWidth === 0) return;
    const t = setInterval(() => {
      setBannerIdx((p) => {
        const n = (p + 1) % featured.length;
        bannerRef.current?.scrollTo({ x: n * bannerWidth, animated: true });
        return n;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [featured.length, bannerWidth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onSubmitSearch = () => {
    router.push({ pathname: "/(tabs)/cars", params: { q: search } });
  };

  const firstName = user?.name?.split(" ")[0] ?? "Member";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        testID="home-scroll"
      >
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.brandLeft}>
            <Image source={LOGO_SOURCE} style={styles.brandLogo} resizeMode="contain" />
            <View>
              <Text style={styles.brandName}>EliteReserve</Text>
              <Text style={styles.brandCity}>MELBOURNE</Text>
            </View>
          </View>
          <Pressable
            testID="header-user"
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.userChip}
          >
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.userAvatar} />
            ) : (
              <View style={styles.userAvatarFallback}>
                <Text style={styles.userAvatarInitial}>{user?.name?.[0]?.toUpperCase() ?? "M"}</Text>
              </View>
            )}
            <View>
              <Text style={styles.userName} numberOfLines={1}>{firstName}</Text>
              <Text style={styles.userBalance}>${(user?.wallet_balance ?? 0).toFixed(0)}</Text>
            </View>
          </Pressable>
        </View>

        {/* Greeting */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingMuted}>Good drive ahead</Text>
            <Text style={styles.greetingName}>Pick your <Text style={{ fontStyle: "italic", color: colors.primary }}>moment</Text>.</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            testID="home-search"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={onSubmitSearch}
            returnKeyType="search"
            placeholder="Search Lamborghini, Rolls-Royce, Tesla..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          <Pressable onPress={() => router.push("/(tabs)/cars")} style={styles.filterBtn} testID="home-filter">
            <Ionicons name="options-outline" size={16} color={colors.primary} />
          </Pressable>
        </View>

        {/* Hero Banner Slider */}
        {featured.length > 0 && (
          <View
            style={{ marginTop: spacing.lg, overflow: "hidden" }}
            onLayout={(e) => setBannerWidth(e.nativeEvent.layout.width)}
          >
            <ScrollView
              ref={bannerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                if (bannerWidth > 0) {
                  setBannerIdx(Math.round(e.nativeEvent.contentOffset.x / bannerWidth));
                }
              }}
            >
              {featured.map((item) => (
                <Pressable
                  key={item.car_id}
                  testID={`banner-${item.car_id}`}
                  onPress={() => router.push(`/car/${item.car_id}`)}
                  style={[styles.banner, { width: bannerWidth, marginHorizontal: 0 }]}
                >
                  <View style={styles.bannerInner}>
                    <Image source={{ uri: item.image }} style={styles.bannerImg} />
                    <LinearGradient
                      colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.95)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.bannerContent}>
                      <Text style={styles.bannerEyebrow}>FEATURED • {item.category.toUpperCase()}</Text>
                      <Text style={styles.bannerBrand}>{item.brand}</Text>
                      <Text style={styles.bannerModel}>{item.model}</Text>
                      <View style={styles.bannerStats}>
                        <View style={styles.bannerStat}>
                          <Text style={styles.bannerStatVal}>{item.horsepower}</Text>
                          <Text style={styles.bannerStatLabel}>HP</Text>
                        </View>
                        <View style={styles.bannerStatDivider} />
                        <View style={styles.bannerStat}>
                          <Text style={styles.bannerStatVal}>{item.acceleration.split(" ")[0]}</Text>
                          <Text style={styles.bannerStatLabel}>0-100</Text>
                        </View>
                        <View style={styles.bannerStatDivider} />
                        <View style={styles.bannerStat}>
                          <Text style={styles.bannerStatVal}>${item.price_per_day.toFixed(0)}</Text>
                          <Text style={styles.bannerStatLabel}>/DAY</Text>
                        </View>
                      </View>
                      <View style={styles.bannerCta}>
                        <Text style={styles.bannerCtaText}>Discover</Text>
                        <Ionicons name="arrow-forward" size={14} color="#000" />
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.dots}>
              {featured.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === bannerIdx && styles.dotActive]}
                />
              ))}
            </View>
          </View>
        )}

        {/* Categories */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Categories</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        >
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <Pressable
                key={c.key}
                testID={`category-${c.key}`}
                onPress={() => setCategory(c.key)}
                style={[styles.catPill, active && styles.catPillActive]}
              >
                <Ionicons name={c.icon} size={14} color={active ? "#000" : colors.textPrimary} />
                <Text style={[styles.catText, active && styles.catTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Featured Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{category === "All" ? "Curated" : category}</Text>
          <Pressable onPress={() => router.push("/(tabs)/cars")} testID="view-all">
            <Text style={styles.sectionLink}>View all →</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: spacing.lg }}>
          {cars.slice(0, 4).map((c) => (
            <CarCard key={c.car_id} car={c} />
          ))}
        </View>
      </ScrollView>
    </Screen>
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
  brandLogo: { width: 44, height: 44 },
  brandName: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium, letterSpacing: -0.3 },
  brandCity: { color: colors.primary, fontSize: 9, letterSpacing: 3, fontFamily: fonts.bodyBold, marginTop: 1 },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 160,
  },
  userAvatar: { width: 32, height: 32, borderRadius: 16 },
  userAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarInitial: { color: colors.primary, fontFamily: fonts.displayMedium, fontSize: 14 },
  userName: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 12, maxWidth: 80 },
  userBalance: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, marginTop: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  greetingMuted: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontFamily: fonts.bodyMedium },
  greetingName: {
    color: colors.textPrimary,
    fontSize: 28,
    fontFamily: fonts.display,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  walletChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  walletText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 },
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
    height: 52,
    borderRadius: radius.full,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14 },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    height: BANNER_H,
  },
  bannerInner: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  bannerImg: { width: "100%", height: "100%" },
  bannerContent: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  bannerEyebrow: { color: colors.textSecondary, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold, marginBottom: 8 },
  bannerBrand: { color: colors.textSecondary, fontSize: 13, letterSpacing: 4, fontFamily: fonts.bodyMedium },
  bannerModel: {
    color: colors.textPrimary,
    fontSize: 34,
    fontFamily: fonts.display,
    letterSpacing: -0.5,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  bannerStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  bannerStat: { flex: 1 },
  bannerStatVal: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium },
  bannerStatLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyMedium, marginTop: 2 },
  bannerStatDivider: { width: 1, height: 28, backgroundColor: colors.border },
  bannerCta: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  bannerCtaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3 },
  sectionLink: { color: colors.textSecondary, fontFamily: fonts.bodyMedium, fontSize: 12 },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  catPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catText: { color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13 },
  catTextActive: { color: "#000" },
});

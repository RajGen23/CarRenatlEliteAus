import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { Car, Review } from "@/src/types";

export default function CarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [car, setCar] = useState<Car | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [wishlisted, setWishlisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const galleryRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [c, rv, wl] = await Promise.all([
        api.get<Car>(`/cars/${id}`),
        api.get<Review[]>(`/cars/${id}/reviews`),
        api.get<Car[]>("/wishlist"),
      ]);
      setCar(c);
      setReviews(rv);
      setWishlisted(wl.some((w) => w.car_id === id));
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleWishlist = async () => {
    try {
      if (wishlisted) {
        await api.del(`/wishlist/${id}`);
      } else {
        await api.post(`/wishlist/${id}`);
      }
      setWishlisted(!wishlisted);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (loading || !car) {
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Gallery */}
        <View
          style={styles.galleryWrap}
          onLayout={(e) => setGalleryWidth(e.nativeEvent.layout.width)}
        >
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              if (galleryWidth > 0) {
                setGalleryIdx(Math.round(e.nativeEvent.contentOffset.x / galleryWidth));
              }
            }}
            scrollEventThrottle={16}
          >
            {car.gallery.map((src, i) => (
              <Image
                key={i}
                source={{ uri: src }}
                style={{ width: galleryWidth, height: 460 }}
              />
            ))}
          </ScrollView>
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "transparent", "rgba(0,0,0,0.85)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.galleryTopBar}>
            <Pressable testID="detail-back" onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
            <View style={styles.counterChip}>
              <Ionicons name="images-outline" size={11} color={colors.primary} />
              <Text style={styles.counterText}>
                {galleryIdx + 1} / {car.gallery.length}
              </Text>
            </View>
            <Pressable testID="wishlist-toggle" onPress={toggleWishlist} style={styles.iconBtn}>
              <Ionicons
                name={wishlisted ? "heart" : "heart-outline"}
                size={20}
                color={wishlisted ? colors.error : colors.primary}
              />
            </Pressable>
          </View>

          {car.gallery.length > 1 && (
            <>
              {galleryIdx > 0 && (
                <Pressable
                  testID="gallery-prev"
                  onPress={() => {
                    const next = galleryIdx - 1;
                    galleryRef.current?.scrollTo({ x: next * galleryWidth, animated: true });
                    setGalleryIdx(next);
                  }}
                  style={[styles.navArrow, { left: spacing.md }]}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.primary} />
                </Pressable>
              )}
              {galleryIdx < car.gallery.length - 1 && (
                <Pressable
                  testID="gallery-next"
                  onPress={() => {
                    const next = galleryIdx + 1;
                    galleryRef.current?.scrollTo({ x: next * galleryWidth, animated: true });
                    setGalleryIdx(next);
                  }}
                  style={[styles.navArrow, { right: spacing.md }]}
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                </Pressable>
              )}
            </>
          )}

          <View style={styles.galleryDots}>
            {car.gallery.map((_, i) => (
              <View key={i} style={[styles.dot, i === galleryIdx && styles.dotActive]} />
            ))}
          </View>
        </View>

        {/* Thumbnail strip */}
        {car.gallery.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
          >
            {car.gallery.map((src, i) => (
              <Pressable
                key={i}
                testID={`thumb-${i}`}
                onPress={() => {
                  galleryRef.current?.scrollTo({ x: i * galleryWidth, animated: true });
                  setGalleryIdx(i);
                }}
              >
                <Image
                  source={{ uri: src }}
                  style={[styles.thumb, i === galleryIdx && styles.thumbActive]}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Title */}
        <View style={styles.titleBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandLabel}>{car.brand.toUpperCase()}</Text>
            <Text style={styles.modelLabel}>{car.model}</Text>
            <View style={styles.metaRow}>
              <View style={styles.ratingChip}>
                <Ionicons name="star" size={11} color={colors.primary} />
                <Text style={styles.ratingTxt}>{car.rating.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>· {car.reviews_count}</Text>
              </View>
              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{car.category}</Text>
              </View>
              <View style={[styles.statusChip, !car.available && styles.statusChipUnavail]}>
                <View style={[styles.statusDot, { backgroundColor: car.available ? colors.success : colors.error }]} />
                <Text style={styles.statusChipText}>{car.available ? "Available" : "Booked"}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Spec grid */}
        <View style={styles.specGrid}>
          <SpecCard label="POWER" value={`${car.horsepower}`} unit="HP" icon="flash-outline" />
          <SpecCard label="0-100 KM/H" value={car.acceleration.split(" ")[0]} unit="SEC" icon="speedometer-outline" />
          <SpecCard label="TOP SPEED" value={`${car.top_speed}`} unit="KM/H" icon="trending-up-outline" />
          <SpecCard label="SEATS" value={`${car.seats}`} unit="" icon="people-outline" />
          <SpecCard label="FUEL" value={car.fuel_type} unit="" icon="battery-charging-outline" />
          <SpecCard label="GEARBOX" value={car.transmission} unit="" icon="settings-outline" />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <Text style={styles.description}>{car.description}</Text>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FEATURES</Text>
          <View style={styles.featuresList}>
            {car.features.map((f) => (
              <View key={f} style={styles.featureItem}>
                <Ionicons name="checkmark" size={14} color={colors.primary} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <View style={styles.reviewHeader}>
            <Text style={styles.sectionLabel}>REVIEWS · {reviews.length}</Text>
            <Pressable
              testID="add-review"
              onPress={() => router.push(`/review/${car.car_id}`)}
            >
              <Text style={styles.addReviewLink}>+ Add</Text>
            </Pressable>
          </View>
          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>No reviews yet. Be the first.</Text>
          ) : (
            reviews.slice(0, 3).map((r) => (
              <View key={r.review_id} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <View style={styles.reviewAvatar}>
                    <Text style={styles.reviewAvatarText}>{r.user_name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewName}>{r.user_name}</Text>
                    <View style={styles.reviewStars}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Ionicons
                          key={i}
                          name={i < r.rating ? "star" : "star-outline"}
                          size={10}
                          color={colors.primary}
                        />
                      ))}
                    </View>
                  </View>
                </View>
                <Text style={styles.reviewText}>{r.comment}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Sticky Book bar */}
      <View style={[styles.bookBar, { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.xl) }]}>
        <View>
          <Text style={styles.bookBarPriceLabel}>FROM</Text>
          <Text style={styles.bookBarPrice}>
            ${car.price_per_day.toFixed(0)}<Text style={styles.bookBarPriceUnit}>/day</Text>
          </Text>
        </View>
        <Pressable
          testID="book-now-btn"
          onPress={() => router.push(`/book/${car.car_id}`)}
          disabled={!car.available}
          style={({ pressed }) => [
            styles.bookBtn,
            !car.available && styles.bookBtnDisabled,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={[styles.bookBtnText, !car.available && { color: colors.textMuted }]}>
            {car.available ? "Book now" : "Unavailable"}
          </Text>
          {car.available && <Ionicons name="arrow-forward" size={16} color="#000" />}
        </Pressable>
      </View>
    </Screen>
  );
}

function SpecCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.specCard}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <Text style={styles.specLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Text style={styles.specValue}>{value}</Text>
        {unit ? <Text style={styles.specUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  galleryWrap: { width: "100%", height: 460, position: "relative", overflow: "hidden" },
  galleryTopBar: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryDots: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  counterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  counterText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1 },
  navArrow: {
    position: "absolute",
    top: "50%",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -19,
  },
  thumbStrip: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 10 },
  thumb: {
    width: 64,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.5,
  },
  thumbActive: { borderColor: colors.primary, opacity: 1 },
  titleBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexDirection: "row" },
  brandLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 4, fontFamily: fonts.bodyBold },
  modelLabel: { color: colors.textPrimary, fontSize: 32, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  ratingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratingTxt: { color: colors.textPrimary, fontSize: 11, fontFamily: fonts.bodyBold },
  ratingCount: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.body },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipText: { color: colors.textPrimary, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipUnavail: { borderColor: "rgba(255,107,107,0.3)" },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusChipText: { color: colors.textPrimary, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  specGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  specCard: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 8,
  },
  specLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  specValue: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayMedium },
  specUnit: { color: colors.textSecondary, fontSize: 10, fontFamily: fonts.body },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold, marginBottom: spacing.md },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, fontFamily: fonts.body },
  featuresList: { gap: spacing.sm },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  featureText: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.body },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  addReviewLink: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1 },
  noReviews: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 8 },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarText: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 14 },
  reviewName: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bodyMedium },
  reviewStars: { flexDirection: "row", gap: 2, marginTop: 2 },
  reviewText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, fontFamily: fonts.body },
  bookBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookBarPriceLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  bookBarPrice: { color: colors.textPrimary, fontSize: 26, fontFamily: fonts.display, marginTop: 2 },
  bookBarPriceUnit: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body },
  bookBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bookBtnDisabled: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  bookBtnText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
});

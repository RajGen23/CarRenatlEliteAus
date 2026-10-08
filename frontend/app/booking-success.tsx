import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function BookingSuccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1, duration: 600, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [scale, fade]);

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.container}>
        <Animated.View style={[styles.iconRing, { transform: [{ scale }] }]}>
          <Ionicons name="paper-plane" size={36} color="#000" />
        </Animated.View>
        <Animated.View style={{ opacity: fade, alignItems: "center" }}>
          <Text style={styles.eyebrow}>REQUEST SENT</Text>
          <Text style={styles.title}>Awaiting host</Text>
          <Text style={styles.subtitle}>
            The host is reviewing your profile now. They have 24 hours to accept — you are only
            charged once they do.
          </Text>
          {id && (
            <View style={styles.idChip}>
              <Text style={styles.idLabel}>REQUEST ID</Text>
              <Text style={styles.idValue}>#{id.slice(-8).toUpperCase()}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              testID="view-bookings"
              onPress={() => router.replace("/(tabs)/bookings")}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryText}>Track request</Text>
              <Ionicons name="arrow-forward" size={14} color="#000" />
            </Pressable>
            <Pressable
              testID="back-home"
              onPress={() => router.replace("/(tabs)/home")}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryText}>Back to garage</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  iconRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.xl,
  },
  eyebrow: { color: colors.textMuted, fontSize: 11, letterSpacing: 4, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 36, fontFamily: fonts.display, marginTop: spacing.sm, letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14, lineHeight: 22, textAlign: "center", marginTop: spacing.md },
  idChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.xl,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  idLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  idValue: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1 },
  actions: { width: "100%", marginTop: spacing.xxl, gap: spacing.md },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.full,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  primaryText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
  },
  secondaryText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
});

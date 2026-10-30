import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Props = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

export function UnavailableState({ title, message, actionLabel = "Browse cars", onAction, testID }: Props) {
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/cars"));
  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.top}>
        <Pressable onPress={goBack} style={styles.iconBtn} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.body} testID={testID}>
        <Ionicons name="car-sport-outline" size={44} color={colors.textMuted} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable
          onPress={onAction ?? (() => router.replace("/(tabs)/cars"))}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ctaText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={14} color="#000" />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  title: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 20, textAlign: "center", marginTop: spacing.sm },
  message: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: "center" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.full,
    marginTop: spacing.md,
  },
  ctaText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5 },
});

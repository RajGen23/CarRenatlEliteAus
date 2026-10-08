import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!comment.trim()) {
      Alert.alert("Required", "Please write a comment.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/reviews", { car_id: id, rating, comment });
      Alert.alert("Thank you", "Your review has been posted.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable testID="review-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.topBarEyebrow}>SHARE</Text>
          <Text style={styles.topBarTitle}>Write a Review</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <View style={{ padding: spacing.lg, flex: 1 }}>
        <Text style={styles.label}>YOUR RATING</Text>
        <View style={styles.stars}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Pressable
              key={i}
              testID={`star-${i + 1}`}
              onPress={() => setRating(i + 1)}
              style={({ pressed }) => [pressed && { transform: [{ scale: 0.92 }] }]}
            >
              <Ionicons
                name={i < rating ? "star" : "star-outline"}
                size={36}
                color={colors.primary}
              />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>YOUR EXPERIENCE</Text>
        <TextInput
          testID="review-comment"
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={6}
          placeholder="Share what made this drive memorable..."
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <Pressable
          testID="submit-review"
          onPress={submit}
          disabled={submitting}
          style={({ pressed }) => [styles.submitBtn, (pressed || submitting) && { opacity: 0.9 }]}
        >
          {submitting ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>Post review</Text>}
        </Pressable>
      </View>
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
  label: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold, marginBottom: spacing.md },
  stars: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 14,
    minHeight: 140,
    textAlignVertical: "top",
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: radius.full,
    marginTop: spacing.xl,
    alignItems: "center",
  },
  submitText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
});

import React from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing } from "@/src/theme";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="confirm-modal">
          <View
            style={[
              styles.iconWrap,
              destructive && { borderColor: "rgba(255,107,107,0.4)" },
            ]}
          >
            <Ionicons
              name={destructive ? "alert-circle" : "help-circle"}
              size={26}
              color={destructive ? colors.error : colors.primary}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              testID="confirm-cancel"
              onPress={onCancel}
              style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.btnSecondaryText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              testID="confirm-ok"
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                destructive && styles.btnDestructive,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={[styles.btnPrimaryText, destructive && { color: "#fff" }]}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontFamily: fonts.displayMedium,
    textAlign: "center",
  },
  message: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.body,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: "100%",
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.full,
    alignItems: "center",
  },
  btnSecondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" },
  btnSecondaryText: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  btnDestructive: { backgroundColor: colors.error },
});

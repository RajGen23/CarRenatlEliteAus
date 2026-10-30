import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius } from "@/src/theme";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  testID?: string;
};

export function AgreementCheckbox({ checked, onChange, children, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.row}
      hitSlop={6}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Ionicons name="checkmark" size={13} color="#000" /> : null}
      </View>
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { flex: 1, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
});

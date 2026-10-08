import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { useAppConfig } from "@/src/appConfig";
import { useAuth } from "@/src/AuthContext";
import { colors, fonts, radius, spacing } from "@/src/theme";

const AMOUNTS = [100, 500, 1000, 2500, 5000];

export default function Wallet() {
  const { user, refresh } = useAuth();
  const { demo_payments } = useAppConfig();
  const [topping, setTopping] = useState<number | null>(null);

  const topup = async (amount: number) => {
    setTopping(amount);
    try {
      await api.post("/wallet/topup", { amount });
      await refresh();
      Alert.alert("Success", `$${amount.toFixed(2)} added to your wallet.`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setTopping(null);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable testID="wallet-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View>
          <Text style={styles.topBarEyebrow}>FINANCE</Text>
          <Text style={styles.topBarTitle}>Wallet</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: spacing.lg }}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
          <Text style={styles.balanceAmount} testID="wallet-balance">
            ${(user?.wallet_balance ?? 0).toFixed(2)}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.balanceMember}>{user?.name} · ELITERESERVE</Text>
        </View>

        {demo_payments ? (
          <>
            <Text style={styles.sectionLabel}>QUICK TOP-UP · DEMO</Text>
            <View style={styles.grid}>
              {AMOUNTS.map((a) => (
                <Pressable
                  key={a}
                  testID={`topup-${a}`}
                  disabled={topping !== null}
                  onPress={() => topup(a)}
                  style={({ pressed }) => [
                    styles.amountCard,
                    (pressed || topping === a) && { backgroundColor: colors.primary },
                  ]}
                >
                  {({ pressed }) => (
                    <>
                      <Text
                        style={[
                          styles.amountValue,
                          (pressed || topping === a) && { color: "#000" },
                        ]}
                      >
                        ${a}
                      </Text>
                      <Text
                        style={[
                          styles.amountAdd,
                          (pressed || topping === a) && { color: "#000" },
                        ]}
                      >
                        + Add
                      </Text>
                    </>
                  )}
                </Pressable>
              ))}
            </View>

            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
              <Text style={styles.noteText}>
                Demo mode: top-ups add test credit only. No card is charged and no real money moves.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.noteText}>
              Adding funds by card is coming soon. Your balance covers bookings, refunds and credits.
            </Text>
          </View>
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
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarEyebrow: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold, textAlign: "center" },
  topBarTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, textAlign: "center", marginTop: 2 },
  balanceCard: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    alignItems: "center",
  },
  balanceLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  balanceAmount: { color: colors.textPrimary, fontSize: 48, fontFamily: fonts.display, letterSpacing: -1, marginTop: spacing.sm },
  divider: { width: 40, height: 1, backgroundColor: colors.borderStrong, marginVertical: spacing.md },
  balanceMember: { color: colors.textSecondary, fontSize: 11, letterSpacing: 2, fontFamily: fonts.bodyMedium },
  sectionLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bodyBold, marginTop: spacing.xl, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  amountCard: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  amountValue: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.display },
  amountAdd: { color: colors.textMuted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bodyBold, marginTop: 4 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  noteText: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, flex: 1 },
});

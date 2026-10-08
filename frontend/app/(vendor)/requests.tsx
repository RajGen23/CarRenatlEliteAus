import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { notify } from "@/src/utils/dialog";
import type { Booking, RenterCard } from "@/src/types";

type RequestItem = Booking & { renter: RenterCard; commission: number; net: number };

function hoursLeft(iso?: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hrs = Math.floor(diff / 3600000);
  if (hrs >= 1) return `${hrs}h left to respond`;
  return `${Math.max(1, Math.floor(diff / 60000))}m left to respond`;
}

export default function VendorRequests() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<RequestItem | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ requests: RequestItem[]; decline_reasons: string[] }>("/vendor/requests");
      setItems(res.requests);
      setReasons(res.decline_reasons);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const accept = async (b: RequestItem) => {
    setBusy(b.booking_id);
    try {
      await api.post(`/vendor/bookings/${b.booking_id}/accept`);
      await load();
      notify("Request accepted", `${b.renter.name} is charged $${b.total.toFixed(2)}. The trip is confirmed.`);
    } catch (e: any) {
      await load();
      notify("Could not accept", e.message);
    } finally {
      setBusy(null);
    }
  };

  const submitDecline = async () => {
    if (!declining || !reason) return;
    setBusy(declining.booking_id);
    try {
      await api.post(`/vendor/bookings/${declining.booking_id}/decline`, { reason, note: note.trim() || undefined });
      setDeclining(null);
      setReason(null);
      setNote("");
      await load();
      notify("Request declined", "The renter has been notified with your reason.");
    } catch (e: any) {
      notify("Could not decline", e.message);
    } finally {
      setBusy(null);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>APPROVALS</Text>
        <Text style={styles.title}>Trip Requests</Text>
        <Text style={styles.sub}>
          {items.length === 0
            ? "No renters waiting on you"
            : `${items.length} ${items.length === 1 ? "renter is" : "renters are"} waiting on your decision`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.primary}
          />
        }
        testID="vendor-requests-list"
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>All caught up</Text>
            <Text style={styles.emptySub}>New rental applications will appear here for approval.</Text>
          </View>
        ) : (
          items.map((b) => (
            <View key={b.booking_id} style={styles.card} testID={`request-${b.booking_id}`}>
              {/* Countdown */}
              <View style={styles.timerRow}>
                <Ionicons name="time-outline" size={12} color={colors.warning} />
                <Text style={styles.timerText}>{hoursLeft(b.request_expires_at) ?? "Awaiting response"}</Text>
              </View>

              {/* Renter profile */}
              <View style={styles.renterRow}>
                {b.renter.picture ? (
                  <Image source={{ uri: b.renter.picture }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInit}>{b.renter.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.renterName}>{b.renter.name}</Text>
                  <Text style={styles.renterMeta}>
                    {b.renter.trips} {b.renter.trips === 1 ? "trip" : "trips"} ·{" "}
                    {b.renter.rating ? `${b.renter.rating.toFixed(1)}★` : "New renter"} · Member since{" "}
                    {b.renter.member_since
                      ? new Date(b.renter.member_since).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
                      : "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.badges}>
                <VerifyBadge ok={b.renter.license_verified} label="Licence" />
                <VerifyBadge ok={b.renter.id_verified} label="ID" />
              </View>

              <View style={styles.detailBlock}>
                <Detail icon="call-outline" label="PHONE" value={b.renter.phone || "—"} />
                <Detail icon="mail-outline" label="EMAIL" value={b.renter.email || "—"} />
                <Detail icon="home-outline" label="ADDRESS" value={b.renter.address || "—"} />
                <Detail icon="calendar-outline" label="DATE OF BIRTH" value={b.renter.dob || "—"} />
                <Detail
                  icon="card-outline"
                  label="LICENCE"
                  value={b.renter.license_no ? `${b.renter.license_no} · exp ${b.renter.license_expiry}` : "—"}
                />
              </View>

              {/* Car + schedule */}
              <View style={styles.carRow}>
                <Image source={{ uri: b.car_image }} style={styles.carImg} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.carBrand}>{b.car_brand.toUpperCase()}</Text>
                  <Text style={styles.carModel}>{b.car_model}</Text>
                  <Text style={styles.schedule}>
                    {fmt(b.pickup_datetime)} → {fmt(b.drop_datetime)} · {b.days}{" "}
                    {b.days === 1 ? "day" : "days"}
                  </Text>
                </View>
              </View>

              <View style={styles.money}>
                <View style={styles.moneyCell}>
                  <Text style={styles.moneyLabel}>GROSS</Text>
                  <Text style={styles.moneyVal}>${b.total.toFixed(2)}</Text>
                </View>
                <View style={styles.moneyCell}>
                  <Text style={styles.moneyLabel}>FEE 15%</Text>
                  <Text style={[styles.moneyVal, { color: colors.textMuted }]}>−${b.commission.toFixed(2)}</Text>
                </View>
                <View style={styles.moneyCell}>
                  <Text style={styles.moneyLabel}>YOU EARN</Text>
                  <Text style={[styles.moneyVal, { color: colors.primary }]}>${b.net.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.actions}>
                <Pressable
                  testID={`decline-${b.booking_id}`}
                  onPress={() => {
                    setDeclining(b);
                    setReason(null);
                    setNote("");
                  }}
                  style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
                <Pressable
                  testID={`accept-${b.booking_id}`}
                  onPress={() => accept(b)}
                  disabled={busy === b.booking_id}
                  style={({ pressed }) => [styles.acceptBtn, (pressed || busy === b.booking_id) && { opacity: 0.85 }]}
                >
                  {busy === b.booking_id ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={15} color="#000" />
                      <Text style={styles.acceptText}>Accept</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Decline reason sheet */}
      <Modal visible={!!declining} transparent animationType="slide" onRequestClose={() => setDeclining(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet} testID="decline-sheet">
            <Text style={styles.sheetTitle}>Why are you declining?</Text>
            <Text style={styles.sheetSub}>The renter sees this, so keep it clear and polite.</Text>
            {reasons.map((r) => {
              const active = reason === r;
              return (
                <Pressable
                  key={r}
                  testID={`reason-${r}`}
                  onPress={() => setReason(r)}
                  style={[styles.reasonRow, active && styles.reasonRowActive]}
                >
                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.reasonText, active && { color: colors.textPrimary }]}>{r}</Text>
                </Pressable>
              );
            })}
            <TextInput
              testID="decline-note"
              value={note}
              onChangeText={setNote}
              placeholder="Add an optional note…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.noteInput}
            />
            <View style={styles.sheetActions}>
              <Pressable
                testID="decline-cancel"
                onPress={() => setDeclining(null)}
                style={[styles.sheetBtn, styles.sheetBtnGhost]}
              >
                <Text style={styles.sheetBtnGhostText}>Keep request</Text>
              </Pressable>
              <Pressable
                testID="decline-submit"
                onPress={submitDecline}
                disabled={!reason || !!busy}
                style={[styles.sheetBtn, styles.sheetBtnDanger, (!reason || !!busy) && { opacity: 0.5 }]}
              >
                <Text style={styles.sheetBtnDangerText}>Decline request</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function VerifyBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={[styles.vBadge, ok ? styles.vBadgeOk : styles.vBadgeNo]}>
      <Ionicons
        name={ok ? "shield-checkmark" : "shield-outline"}
        size={11}
        color={ok ? colors.success : colors.textMuted}
      />
      <Text style={[styles.vBadgeText, { color: ok ? colors.success : colors.textMuted }]}>
        {label} {ok ? "verified" : "unverified"}
      </Text>
    </View>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontFamily: fonts.bodyBold },
  title: { color: colors.textPrimary, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: 4 },
  sub: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body, marginTop: 6 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(240,183,60,0.35)",
    backgroundColor: "rgba(240,183,60,0.08)",
  },
  timerText: { color: colors.warning, fontSize: 10, letterSpacing: 1, fontFamily: fonts.bodyBold },
  renterRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInit: { color: colors.primary, fontFamily: fonts.displayMedium, fontSize: 18 },
  renterName: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.displayMedium },
  renterMeta: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 3 },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  vBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  vBadgeOk: { borderColor: "rgba(124,227,166,0.35)", backgroundColor: "rgba(124,227,166,0.08)" },
  vBadgeNo: { borderColor: colors.border },
  vBadgeText: { fontSize: 10, letterSpacing: 0.5, fontFamily: fonts.bodyBold },
  detailBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold, width: 96 },
  detailValue: { color: colors.textPrimary, fontSize: 12, fontFamily: fonts.body, flex: 1, lineHeight: 17 },
  carRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  carImg: { width: 72, height: 54, borderRadius: radius.md, backgroundColor: "#000" },
  carBrand: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontFamily: fonts.bodyBold },
  carModel: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.displayMedium, marginTop: 2 },
  schedule: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.body, marginTop: 3 },
  money: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  moneyCell: { flex: 1 },
  moneyLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bodyBold },
  moneyVal: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayMedium, marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  declineBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.4)",
    backgroundColor: "rgba(255,107,107,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  declineText: { color: colors.error, fontSize: 13, fontFamily: fonts.bodyBold, letterSpacing: 1 },
  acceptBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  acceptText: { color: "#000", fontSize: 13, fontFamily: fonts.bodyBold, letterSpacing: 1 },
  empty: { alignItems: "center", marginTop: 80, gap: spacing.sm },
  emptyText: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 20, marginTop: spacing.md },
  emptySub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 20, fontFamily: fonts.displayMedium },
  sheetSub: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginTop: 4, marginBottom: spacing.md },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  reasonRowActive: { borderColor: colors.borderStrong, backgroundColor: "rgba(212,175,55,0.06)" },
  reasonText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body, flex: 1 },
  noteInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlignVertical: "top",
    marginTop: spacing.sm,
  },
  sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  sheetBtn: { flex: 1, height: 50, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  sheetBtnGhost: { borderWidth: 1, borderColor: colors.border },
  sheetBtnGhostText: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bodyBold, letterSpacing: 1 },
  sheetBtnDanger: { backgroundColor: colors.error },
  sheetBtnDangerText: { color: "#fff", fontSize: 13, fontFamily: fonts.bodyBold, letterSpacing: 1 },
});

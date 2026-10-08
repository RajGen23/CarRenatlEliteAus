import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AdminShell } from "@/src/components/AdminShell";
import { AdminTable, Badge, ActionBtn } from "@/src/components/AdminTable";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Msg = { from: string; author: string; text: string; at: string };
type Ticket = {
  ticket_id: string; type: "complaint" | "dispute"; subject: string; priority: string;
  status: string; customer_name: string; customer_email?: string;
  booking_label?: string | null; amount?: number | null; messages: Msg[];
  created_at: string; updated_at: string;
};

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = { open: "danger", in_review: "warn", resolved: "ok" };
const PRIORITY_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = { low: "muted", medium: "warn", high: "danger" };

export default function AdminSupport() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    setRows(await api.get<Ticket[]>(`/admin/support?type=${type}&status=${status}`));
  }, [type, status]);
  useEffect(() => { load(); }, [load]);

  const setTicketStatus = async (t: Ticket, st: string) => {
    await api.post(`/admin/support/${t.ticket_id}/status`, { status: st });
    setSelected((cur) => (cur && cur.ticket_id === t.ticket_id ? { ...cur, status: st } : cur));
    load();
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    const msg = await api.post<Msg>(`/admin/support/${selected.ticket_id}/reply`, { text: reply.trim() });
    setSelected({ ...selected, status: "in_review", messages: [...selected.messages, msg] });
    setReply("");
    load();
  };

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  return (
    <AdminShell title="Support">
      <View style={s.toolbar}>
        <View style={s.filterGroup}>
          {["all", "complaint", "dispute"].map((f) => (
            <Pressable key={f} testID={`support-type-${f}`} onPress={() => setType(f)} style={[s.chip, type === f && s.chipActive]}>
              <Text style={[s.chipText, type === f && s.chipTextActive]}>{f === "all" ? "ALL" : `${f.toUpperCase()}S`}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <View style={s.filterGroup}>
          {["all", "open", "in_review", "resolved"].map((f) => (
            <Pressable key={f} testID={`support-status-${f}`} onPress={() => setStatus(f)} style={[s.chip, status === f && s.chipActive]}>
              <Text style={[s.chipText, status === f && s.chipTextActive]}>{f.replace("_", " ").toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={s.count}>{rows.length} tickets</Text>
      <AdminTable
        rows={rows.map((r) => ({ ...r, _key: r.ticket_id }))}
        cols={[
          { key: "subject", label: "TICKET", flex: 2.2, render: (r) => (
            <View>
              <Text style={s.cellBold}>{r.subject}</Text>
              <Text style={s.cellSub}>{r.ticket_id}{r.booking_label ? ` · ${r.booking_label}` : ""}</Text>
            </View>
          ) },
          { key: "customer_name", label: "CUSTOMER", flex: 1.4, render: (r) => (
            <View><Text style={s.cell}>{r.customer_name}</Text><Text style={s.cellSub}>{r.customer_email}</Text></View>
          ) },
          { key: "type", label: "TYPE", render: (r) => (
            <View>
              <Badge tone={r.type === "dispute" ? "warn" : "info"} label={r.type.toUpperCase()} />
              {r.amount ? <Text style={[s.cellSub, { color: colors.primary }]}>${r.amount}</Text> : null}
            </View>
          ) },
          { key: "priority", label: "PRIORITY", render: (r) => <Badge tone={PRIORITY_TONE[r.priority] ?? "muted"} label={r.priority.toUpperCase()} /> },
          { key: "status", label: "STATUS", render: (r) => <Badge tone={STATUS_TONE[r.status] ?? "muted"} label={r.status.replace("_", " ").toUpperCase()} /> },
          { key: "updated_at", label: "UPDATED", render: (r) => <Text style={s.cellSub}>{fmt(r.updated_at)}</Text> },
          { key: "actions", label: "", render: (r) => (
            <ActionBtn testID={`open-ticket-${r.ticket_id}`} label="Open" tone="outline" onPress={() => setSelected(r)} />
          ) },
        ]}
        empty="No tickets match"
      />

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            {selected ? (
              <>
                <View style={s.modalHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalTitle}>{selected.subject}</Text>
                    <Text style={s.cellSub}>
                      {selected.customer_name} · {selected.type.toUpperCase()}
                      {selected.amount ? ` · $${selected.amount} disputed` : ""}
                    </Text>
                  </View>
                  <Pressable testID="close-ticket-modal" onPress={() => setSelected(null)}>
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView style={s.thread} contentContainerStyle={{ gap: 10 }}>
                  {selected.messages.map((m, i) => (
                    <View key={i} style={[s.msg, m.from === "admin" ? s.msgAdmin : s.msgCustomer]}>
                      <Text style={s.msgAuthor}>{m.author} · {fmt(m.at)}</Text>
                      <Text style={s.msgText}>{m.text}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={s.replyRow}>
                  <TextInput
                    testID="ticket-reply-input"
                    value={reply}
                    onChangeText={setReply}
                    placeholder="Write a reply to the customer…"
                    placeholderTextColor={colors.textMuted}
                    style={s.replyInput}
                  />
                  <Pressable testID="ticket-reply-send" onPress={sendReply} style={s.sendBtn}>
                    <Ionicons name="send" size={14} color="#000" />
                  </Pressable>
                </View>

                <View style={s.statusRow}>
                  {selected.status !== "in_review" ? (
                    <ActionBtn testID="ticket-set-review" label="Mark in review" tone="outline" onPress={() => setTicketStatus(selected, "in_review")} />
                  ) : null}
                  {selected.status !== "resolved" ? (
                    <ActionBtn testID="ticket-resolve" label="Resolve" tone="primary" onPress={() => setTicketStatus(selected, "resolved")} />
                  ) : (
                    <Badge tone="ok" label="RESOLVED" />
                  )}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  filterGroup: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 },
  chipTextActive: { color: "#000" },
  count: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: spacing.sm, letterSpacing: 1 },
  cell: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  cellBold: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 },
  cellSub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 560, maxHeight: "85%", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.lg },
  modalHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: spacing.md },
  modalTitle: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 18 },
  thread: { maxHeight: 320, marginBottom: spacing.md },
  msg: { padding: 12, borderRadius: radius.md, borderWidth: 1 },
  msgCustomer: { backgroundColor: "rgba(255,255,255,0.03)", borderColor: colors.border, alignSelf: "flex-start", maxWidth: "88%" },
  msgAdmin: { backgroundColor: "rgba(212,175,55,0.08)", borderColor: colors.borderStrong, alignSelf: "flex-end", maxWidth: "88%" },
  msgAuthor: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, marginBottom: 4 },
  msgText: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  replyRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  replyInput: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: radius.md, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 },
  sendBtn: { width: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  statusRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end", alignItems: "center" },
});

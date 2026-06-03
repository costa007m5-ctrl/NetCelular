import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { db } from "@/lib/supabase";
import type { DbUser, DbSubscription } from "@/lib/supabase";

const PLAN_LABELS: Record<string, string> = {
  basico: "Básico (1 tela)",
  normal: "Normal (2 telas)",
  premium: "Premium (4 telas)",
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function Avatar({ letter, size = 56 }: { letter: string; size?: number }) {
  const colors = useColors();
  return (
    <View style={[av.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}>
      <Text style={[av.letter, { fontSize: size * 0.4, color: colors.primary }]}>{letter.toUpperCase()}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  wrap: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  letter: { fontWeight: "800" },
});

export default function AdminUserScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const [user, setUser] = useState<DbUser | null>(null);
  const [sub, setSub] = useState<DbSubscription | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [blockingUser, setBlockingUser] = useState(false);
  const [activatingPlan, setActivatingPlan] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const [replyingTicket, setReplyingTicket] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [closingTicket, setClosingTicket] = useState<string | null>(null);

  const loadData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [userData, allWithUsers, ticketData] = await Promise.all([
        db.users.getById(userId),
        db.subscriptions.getAllWithUsers(),
        db.tickets.getByUser(userId),
      ]);
      const row = allWithUsers.find((r) => r.user.id === userId);
      setUser(row?.user ?? userData);
      setSub(row?.sub ?? null);
      setTickets(ticketData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [userId]);

  const handleBlock = () => {
    if (!user) return;
    const isBlocked = user.blocked === true;
    Alert.alert(
      isBlocked ? "Desbloquear conta" : "Bloquear conta",
      isBlocked
        ? `Desbloquear ${user.name}? O usuário voltará a ter acesso.`
        : `Bloquear ${user.name}? O usuário não conseguirá mais fazer login.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: isBlocked ? "Desbloquear" : "Bloquear",
          style: isBlocked ? "default" : "destructive",
          onPress: async () => {
            setBlockingUser(true);
            const result = await db.users.setBlocked(user.id!, !isBlocked);
            setBlockingUser(false);
            if (result.error) {
              Alert.alert("Erro", result.error);
            } else {
              setUser((u) => u ? { ...u, blocked: !isBlocked } : u);
            }
          },
        },
      ]
    );
  };

  const handleActivatePlan = async (plan: string) => {
    if (!user?.id) return;
    setActivatingPlan(plan);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);
    const result = await db.subscriptions.activate(user.id, plan, expiry.toISOString());
    setActivatingPlan(null);
    if (result.error) {
      Alert.alert("Erro", result.error);
    } else {
      await loadData();
    }
  };

  const handleDelete = () => {
    if (!user) return;
    Alert.alert(
      "Deletar conta",
      `Tem certeza que deseja deletar a conta de ${user.name}? Essa ação é irreversível.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Deletar",
          style: "destructive",
          onPress: async () => {
            setDeletingUser(true);
            const result = await db.users.deleteAccount(user.id!);
            setDeletingUser(false);
            if (result.error) {
              Alert.alert("Erro", result.error);
            } else {
              router.back();
            }
          },
        },
      ]
    );
  };

  const handleSaveReply = async (ticketId: string) => {
    if (!replyText.trim()) return;
    setSavingReply(true);
    const result = await db.tickets.adminReply(ticketId, replyText.trim());
    setSavingReply(false);
    if (result.error) {
      Alert.alert("Erro", result.error);
    } else {
      setReplyingTicket(null);
      setReplyText("");
      const updated = await db.tickets.getByUser(userId!);
      setTickets(updated);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    setClosingTicket(ticketId);
    await db.tickets.closeTicket(ticketId);
    setClosingTicket(null);
    const updated = await db.tickets.getByUser(userId!);
    setTickets(updated);
  };

  const isBlocked = user?.blocked === true;
  const subExpiry = sub?.expires_at ? new Date(sub.expires_at) : null;
  const isSubActive = subExpiry ? subExpiry > new Date() : false;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Detalhes do Usuário</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !user ? (
        <View style={s.center}>
          <Text style={{ color: colors.mutedForeground }}>Usuário não encontrado.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

          {/* ── Perfil ── */}
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.profileRow}>
              <Avatar letter={user.avatar_letter ?? user.name[0]} size={60} />
              <View style={{ flex: 1 }}>
                <View style={s.nameRow}>
                  <Text style={[s.userName, { color: colors.foreground }]}>{user.name}</Text>
                  {isBlocked && (
                    <View style={s.blockedBadge}>
                      <Text style={s.blockedBadgeTxt}>BLOQUEADO</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.userEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
                <Text style={[s.userMeta, { color: colors.mutedForeground }]}>
                  Membro desde {fmtDate(user.created_at)}
                </Text>
              </View>
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <View style={s.actionRow}>
              <Pressable
                disabled={blockingUser}
                onPress={handleBlock}
                style={[s.actionBtn, {
                  borderColor: isBlocked ? "#22c55e55" : "#ef444455",
                  backgroundColor: isBlocked ? "#22c55e15" : "#ef444415",
                }]}
              >
                {blockingUser ? (
                  <ActivityIndicator size="small" color={isBlocked ? "#22c55e" : "#ef4444"} />
                ) : (
                  <>
                    <Feather name={isBlocked ? "unlock" : "lock"} size={14} color={isBlocked ? "#22c55e" : "#ef4444"} />
                    <Text style={[s.actionBtnTxt, { color: isBlocked ? "#22c55e" : "#ef4444" }]}>
                      {isBlocked ? "Desbloquear" : "Bloquear"}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                disabled={deletingUser}
                onPress={handleDelete}
                style={[s.actionBtn, { borderColor: "#ef444455", backgroundColor: "#ef444415" }]}
              >
                {deletingUser ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <>
                    <Feather name="trash-2" size={14} color="#ef4444" />
                    <Text style={[s.actionBtnTxt, { color: "#ef4444" }]}>Deletar conta</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* ── Assinatura ── */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>ASSINATURA</Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.subRow}>
              <View>
                <Text style={[s.subPlan, { color: colors.foreground }]}>
                  {sub ? (PLAN_LABELS[sub.plan] ?? sub.plan) : "Sem plano ativo"}
                </Text>
                {sub && (
                  <Text style={[s.subExpiry, { color: isSubActive ? "#22c55e" : "#ef4444" }]}>
                    {isSubActive ? `Válido até ${fmtDate(sub.expires_at)}` : `Expirou em ${fmtDate(sub.expires_at)}`}
                  </Text>
                )}
              </View>
              <View style={[s.subStatusBadge, { backgroundColor: isSubActive ? "#22c55e22" : "#ef444422", borderColor: isSubActive ? "#22c55e55" : "#ef444455" }]}>
                <Text style={[s.subStatusTxt, { color: isSubActive ? "#22c55e" : "#ef4444" }]}>
                  {isSubActive ? "Ativo" : "Inativo"}
                </Text>
              </View>
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <Text style={[s.planPickLabel, { color: colors.mutedForeground }]}>Ativar / trocar plano:</Text>
            <View style={s.planBtns}>
              {(["basico", "normal", "premium"] as const).map((p) => {
                const isActive = sub?.plan === p && isSubActive;
                return (
                  <Pressable
                    key={p}
                    disabled={activatingPlan !== null}
                    onPress={() => handleActivatePlan(p)}
                    style={[s.planBtn, {
                      backgroundColor: isActive ? colors.primary : colors.primary + "18",
                      borderColor: colors.primary + "55",
                    }]}
                  >
                    {activatingPlan === p ? (
                      <ActivityIndicator size="small" color={isActive ? "#fff" : colors.primary} />
                    ) : (
                      <Text style={[s.planBtnTxt, { color: isActive ? "#fff" : colors.primary }]}>
                        {p === "basico" ? "Básico" : p === "normal" ? "Normal" : "Premium"}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Tickets ── */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>TICKETS DE SUPORTE</Text>
          {tickets.length === 0 ? (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.emptyTxt, { color: colors.mutedForeground }]}>Nenhum ticket enviado.</Text>
            </View>
          ) : (
            tickets.map((t) => (
              <View key={t.id} style={[s.card, { backgroundColor: colors.card, borderColor: t.status === "open" ? colors.primary + "44" : colors.border }]}>
                <View style={s.ticketHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.ticketSubject, { color: colors.foreground }]}>{t.subject}</Text>
                    <Text style={[s.ticketDate, { color: colors.mutedForeground }]}>{fmtDate(t.created_at)}</Text>
                  </View>
                  <View style={[s.ticketStatus, {
                    backgroundColor: t.status === "open" ? colors.primary + "22" : "#22c55e22",
                    borderColor: t.status === "open" ? colors.primary + "55" : "#22c55e55",
                  }]}>
                    <Text style={[s.ticketStatusTxt, { color: t.status === "open" ? colors.primary : "#22c55e" }]}>
                      {t.status === "open" ? "Aberto" : "Fechado"}
                    </Text>
                  </View>
                </View>

                <Text style={[s.ticketMsg, { color: colors.mutedForeground }]}>{t.message}</Text>

                {t.admin_reply ? (
                  <View style={[s.replyBox, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
                    <Text style={[s.replyLabel, { color: colors.primary }]}>Resposta do admin:</Text>
                    <Text style={[s.replyTxt, { color: colors.foreground }]}>{t.admin_reply}</Text>
                  </View>
                ) : null}

                {replyingTicket === t.id ? (
                  <View style={{ gap: 8, marginTop: 10 }}>
                    <TextInput
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder="Escreva a resposta..."
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      style={[s.replyInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                    />
                    <View style={s.actionRow}>
                      <Pressable
                        onPress={() => { setReplyingTicket(null); setReplyText(""); }}
                        style={[s.actionBtn, { borderColor: colors.border, backgroundColor: "transparent" }]}
                      >
                        <Text style={[s.actionBtnTxt, { color: colors.mutedForeground }]}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        disabled={savingReply}
                        onPress={() => handleSaveReply(t.id)}
                        style={[s.actionBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "18" }]}
                      >
                        {savingReply ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Feather name="send" size={13} color={colors.primary} />
                            <Text style={[s.actionBtnTxt, { color: colors.primary }]}>Enviar</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={[s.actionRow, { marginTop: 10 }]}>
                    <Pressable
                      onPress={() => { setReplyingTicket(t.id); setReplyText(t.admin_reply ?? ""); }}
                      style={[s.actionBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "12" }]}
                    >
                      <Feather name="message-square" size={13} color={colors.primary} />
                      <Text style={[s.actionBtnTxt, { color: colors.primary }]}>
                        {t.admin_reply ? "Editar resposta" : "Responder"}
                      </Text>
                    </Pressable>

                    {t.status === "open" && (
                      <Pressable
                        disabled={closingTicket === t.id}
                        onPress={() => handleCloseTicket(t.id)}
                        style={[s.actionBtn, { borderColor: "#22c55e55", backgroundColor: "#22c55e15" }]}
                      >
                        {closingTicket === t.id ? (
                          <ActivityIndicator size="small" color="#22c55e" />
                        ) : (
                          <>
                            <Feather name="check-circle" size={13} color="#22c55e" />
                            <Text style={[s.actionBtnTxt, { color: "#22c55e" }]}>Fechar</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))
          )}

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1,
    marginTop: 4, marginBottom: -4,
  },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 0,
  },
  divider: { height: 1, marginVertical: 14 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  userName: { fontSize: 17, fontWeight: "700" },
  userEmail: { fontSize: 13, marginTop: 2 },
  userMeta: { fontSize: 12, marginTop: 2 },
  blockedBadge: {
    backgroundColor: "#ef444422", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  blockedBadgeTxt: { color: "#ef4444", fontSize: 10, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  actionBtnTxt: { fontSize: 13, fontWeight: "600" },
  subRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subPlan: { fontSize: 15, fontWeight: "700" },
  subExpiry: { fontSize: 12, marginTop: 3, fontWeight: "600" },
  subStatusBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  subStatusTxt: { fontSize: 12, fontWeight: "700" },
  planPickLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  planBtns: { flexDirection: "row", gap: 8 },
  planBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  planBtnTxt: { fontSize: 13, fontWeight: "700" },
  emptyTxt: { fontSize: 14, textAlign: "center", paddingVertical: 8 },
  ticketHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  ticketSubject: { fontSize: 14, fontWeight: "700" },
  ticketDate: { fontSize: 11, marginTop: 2 },
  ticketStatus: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  ticketStatusTxt: { fontSize: 11, fontWeight: "700" },
  ticketMsg: { fontSize: 13, lineHeight: 19 },
  replyBox: {
    borderRadius: 10, borderWidth: 1,
    padding: 12, marginTop: 10, gap: 4,
  },
  replyLabel: { fontSize: 11, fontWeight: "700" },
  replyTxt: { fontSize: 13, lineHeight: 18 },
  replyInput: {
    borderWidth: 1, borderRadius: 10,
    padding: 12, fontSize: 14,
    minHeight: 80, textAlignVertical: "top",
  },
});

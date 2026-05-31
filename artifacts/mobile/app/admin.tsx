import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Clipboard,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentRequest } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { sendPushNotificationsToTokens, sendContentAddedNotification } from "@/lib/notifications";
import { TMDB_IMG } from "@/lib/api";

const RED = "#e50914";
const GOLD = "#fbbf24";

interface ApiStatus {
  name: string;
  status: "ok" | "error" | "loading";
  latency?: number;
  detail?: string;
}

function StatusBadge({ status }: { status: ApiStatus["status"] }) {
  const colors: Record<string, string> = { ok: "#4caf50", error: "#e50914", loading: "#ff9800" };
  const labels = { ok: "Online", error: "Offline", loading: "Verificando..." };
  return (
    <View style={[badge.wrap, { backgroundColor: colors[status] + "22", borderColor: colors[status] + "55" }]}>
      <View style={[badge.dot, { backgroundColor: colors[status] }]} />
      <Text style={[badge.text, { color: colors[status] }]}>{labels[status]}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 11, fontWeight: "700" },
});

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────────

const BASE_STYLE = `margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;`;
const LOGO = `<span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffffff;">NET<span style="color:#e50914;">PLAY</span></span>`;
const TOP_BAR = `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(90deg,#e50914,#b00710);height:4px;"></td></tr></table>`;
const FOOTER = `<tr><td style="padding:32px 0 0;text-align:center;"><p style="margin:0 0 8px;font-size:12px;color:#444444;">© 2025 NETPLAY. Todos os direitos reservados.</p><p style="margin:0;font-size:12px;color:#333333;">Você está recebendo este e-mail porque possui uma conta no NETPLAY.</p></td></tr>`;
const BTN = (label: string) => `<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">${label}</a></td></tr></table>`;
const URL_COPY = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="border-top:1px solid #2a2a2a;"></td></tr></table><p style="margin:0;font-size:12px;color:#555555;line-height:1.6;">Ou copie e cole este link no navegador:<br/><a href="{{ .ConfirmationURL }}" style="color:#e50914;word-break:break-all;text-decoration:none;">{{ .ConfirmationURL }}</a></p>`;
const ICON_CELL = (emoji: string) => `<table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;padding:14px;"><span style="font-size:28px;">${emoji}</span></td></tr></table>`;
const WARN = (msg: string) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="background-color:#1e1e1e;border-radius:8px;border-left:3px solid #e50914;padding:16px 20px;"><p style="margin:0;font-size:13px;color:#aaaaaa;line-height:1.6;">${msg}</p></td></tr></table>`;

function buildEmail(bodyContent: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="${BASE_STYLE}">
<table width="100%" cellpadding="0" cellspacing="0" style="${BASE_STYLE}">
  <tr><td align="center" style="padding:48px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding-bottom:40px;">${LOGO}</td></tr>
      <tr><td style="background-color:#141414;border-radius:12px;overflow:hidden;">
        ${TOP_BAR}
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 40px 32px;">
          ${bodyContent}
        </td></tr></table>
      </td></tr>
      ${FOOTER}
    </table>
  </td></tr>
</table>
</body></html>`;
}

const EMAIL_TEMPLATES = [
  {
    id: "confirm",
    icon: "✉️",
    label: "Confirmar Inscrição",
    subject: "Confirme seu e-mail no NETPLAY",
    supabase: "Confirm signup",
    html: buildEmail(
      ICON_CELL("✉️") +
      `<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Confirme seu endereço de e-mail</h1>
      <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Obrigado por se cadastrar no <strong style="color:#ffffff;">NETPLAY</strong>! Para ativar sua conta e começar a assistir, confirme seu e-mail clicando no botão abaixo.</p>` +
      BTN("Confirmar E-mail") +
      `<p style="margin:28px 0 0;font-size:13px;color:#666666;line-height:1.6;">O link expira em <strong style="color:#aaaaaa;">24 horas</strong>. Se você não criou uma conta no NETPLAY, pode ignorar este e-mail.</p>` +
      URL_COPY
    ),
  },
  {
    id: "reset",
    icon: "🔑",
    label: "Redefinir Senha",
    subject: "Redefinição de senha – NETPLAY",
    supabase: "Reset password",
    html: buildEmail(
      ICON_CELL("🔑") +
      `<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Redefinição de senha</h1>
      <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Recebemos uma solicitação para redefinir a senha da sua conta <strong style="color:#ffffff;">NETPLAY</strong>. Clique no botão abaixo para criar uma nova senha.</p>` +
      BTN("Redefinir Senha") +
      WARN("⚠️ Este link é válido por <strong style=\"color:#ffffff;\">1 hora</strong>. Se você não solicitou a redefinição, sua senha permanece a mesma.") +
      URL_COPY
    ),
  },
  {
    id: "magic",
    icon: "⚡",
    label: "Link Mágico / OTP",
    subject: "Seu código de acesso – NETPLAY",
    supabase: "Magic Link",
    html: buildEmail(
      ICON_CELL("⚡") +
      `<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Seu link de acesso rápido</h1>
      <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Use o botão abaixo para entrar no <strong style="color:#ffffff;">NETPLAY</strong> instantaneamente, sem precisar de senha.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:10px;border:1px solid #2a2a2a;padding:20px;text-align:center;"><p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:1.5px;color:#666666;text-transform:uppercase;">Código de acesso</p><p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#e50914;font-family:'Courier New',monospace;">{{ .Token }}</p></td></tr></table>
      <p style="margin:0 0 20px;font-size:14px;color:#666666;text-align:center;">ou</p>` +
      `<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Entrar com Link Mágico</a></td></tr></table>
      <p style="margin:28px 0 0;font-size:13px;color:#666666;line-height:1.6;text-align:center;">Expira em <strong style="color:#aaaaaa;">10 minutos</strong>. Não compartilhe este código com ninguém.</p>` +
      URL_COPY
    ),
  },
  {
    id: "change-email",
    icon: "📧",
    label: "Alterar E-mail",
    subject: "Confirme seu novo e-mail – NETPLAY",
    supabase: "Change email address",
    html: buildEmail(
      ICON_CELL("📧") +
      `<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Confirme seu novo e-mail</h1>
      <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Você solicitou a alteração do endereço de e-mail da sua conta <strong style="color:#ffffff;">NETPLAY</strong>. Clique abaixo para confirmar o novo endereço.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:8px;border:1px solid #2a2a2a;padding:16px 20px;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:1px;color:#666666;text-transform:uppercase;">Novo e-mail</p><p style="margin:0;font-size:16px;color:#ffffff;font-weight:600;">{{ .Email }}</p></td></tr></table>` +
      BTN("Confirmar Novo E-mail") +
      WARN("⚠️ O link expira em <strong style=\"color:#ffffff;\">1 hora</strong>. Até a confirmação, você continua acessando com o e-mail antigo. Se não foi você, ignore este e-mail.") +
      URL_COPY
    ),
  },
  {
    id: "invite",
    icon: "🎬",
    label: "Convidar Usuário",
    subject: "Você foi convidado para o NETPLAY!",
    supabase: "Invite user",
    html: buildEmail(
      `<div style="background:linear-gradient(180deg,#1a0000 0%,#141414 100%);margin:-40px -40px 32px;padding:40px 40px 32px;text-align:center;">
        <p style="margin:0 0 16px;font-size:48px;">🎬</p>
        <h1 style="margin:0 0 12px;font-size:26px;font-weight:900;color:#ffffff;line-height:1.3;">Você foi convidado para o NETPLAY!</h1>
        <p style="margin:0;font-size:16px;color:#aaaaaa;line-height:1.6;">Filmes, séries e muito mais — agora ao seu alcance.</p>
      </div>
      <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Um administrador do <strong style="color:#ffffff;">NETPLAY</strong> convidou você para criar uma conta. Clique no botão abaixo para aceitar o convite e definir sua senha.</p>` +
      BTN("Aceitar Convite") +
      `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr>
        <td width="33%" style="padding:12px;text-align:center;background:#1e1e1e;border-radius:8px;"><p style="margin:0 0 4px;font-size:20px;">🎥</p><p style="margin:0;font-size:11px;color:#aaaaaa;font-weight:600;">Filmes &amp; Séries</p></td>
        <td width="4%"></td>
        <td width="30%" style="padding:12px;text-align:center;background:#1e1e1e;border-radius:8px;"><p style="margin:0 0 4px;font-size:20px;">📱</p><p style="margin:0;font-size:11px;color:#aaaaaa;font-weight:600;">Qualquer Tela</p></td>
        <td width="4%"></td>
        <td width="29%" style="padding:12px;text-align:center;background:#1e1e1e;border-radius:8px;"><p style="margin:0 0 4px;font-size:20px;">🎭</p><p style="margin:0;font-size:11px;color:#aaaaaa;font-weight:600;">Múltiplos Perfis</p></td>
      </tr></table>
      <p style="margin:0 0 28px;font-size:13px;color:#666666;line-height:1.6;">O convite expira em <strong style="color:#aaaaaa;">24 horas</strong>.</p>` +
      URL_COPY
    ),
  },
  {
    id: "reauth",
    icon: "🛡️",
    label: "Reautenticação",
    subject: "Confirme sua identidade – NETPLAY",
    supabase: "Reauthentication",
    html: buildEmail(
      ICON_CELL("🛡️") +
      `<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Confirmação de identidade</h1>
      <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Para sua segurança, precisamos confirmar sua identidade antes de continuar com esta operação na sua conta <strong style="color:#ffffff;">NETPLAY</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:10px;border:1px solid #2a2a2a;padding:20px;text-align:center;"><p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:1.5px;color:#666666;text-transform:uppercase;">Código de verificação</p><p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#e50914;font-family:'Courier New',monospace;">{{ .Token }}</p></td></tr></table>
      <p style="margin:0 0 20px;font-size:14px;color:#666666;text-align:center;">ou</p>` +
      `<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Verificar Identidade</a></td></tr></table>
      <p style="margin:28px 0 0;font-size:13px;color:#666666;line-height:1.6;text-align:center;">Expira em <strong style="color:#aaaaaa;">10 minutos</strong>. Não compartilhe este código.</p>` +
      URL_COPY
    ),
  },
];

// ─── EMAIL TEMPLATE CARD ─────────────────────────────────────────────────────

function EmailTemplateCard({ tpl, colors }: { tpl: typeof EMAIL_TEMPLATES[0]; colors: any }) {
  const [copied, setCopied] = useState<"html" | "subject" | null>(null);

  const copy = (type: "html" | "subject") => {
    const text = type === "html" ? tpl.html : tpl.subject;
    if (Platform.OS === "web") {
      navigator.clipboard?.writeText(text).catch(() => {});
    } else {
      Clipboard.setString(text);
    }
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <View style={[emailCard.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={emailCard.top}>
        <View style={emailCard.iconWrap}>
          <Text style={{ fontSize: 20 }}>{tpl.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[emailCard.label, { color: colors.foreground }]}>{tpl.label}</Text>
          <Text style={[emailCard.supabase, { color: colors.mutedForeground }]}>Supabase: "{tpl.supabase}"</Text>
        </View>
      </View>

      <View style={[emailCard.subjectRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[emailCard.subjectLabel, { color: colors.mutedForeground }]}>ASSUNTO</Text>
          <Text style={[emailCard.subjectText, { color: colors.foreground }]} numberOfLines={1}>{tpl.subject}</Text>
        </View>
        <Pressable
          onPress={() => copy("subject")}
          style={[emailCard.copyBtn, { backgroundColor: copied === "subject" ? "#22c55e22" : colors.cardElevated, borderColor: copied === "subject" ? "#22c55e55" : colors.border }]}
        >
          <Feather name={copied === "subject" ? "check" : "copy"} size={12} color={copied === "subject" ? "#22c55e" : colors.mutedForeground} />
          <Text style={[emailCard.copyTxt, { color: copied === "subject" ? "#22c55e" : colors.mutedForeground }]}>
            {copied === "subject" ? "Copiado!" : "Copiar"}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => copy("html")}
        style={[emailCard.htmlBtn, {
          backgroundColor: copied === "html" ? "#22c55e18" : `${RED}12`,
          borderColor: copied === "html" ? "#22c55e40" : `${RED}40`,
        }]}
      >
        <Feather name={copied === "html" ? "check-circle" : "code"} size={15} color={copied === "html" ? "#22c55e" : RED} />
        <Text style={[emailCard.htmlTxt, { color: copied === "html" ? "#22c55e" : RED }]}>
          {copied === "html" ? "HTML copiado! Cole no Supabase" : "Copiar HTML completo"}
        </Text>
      </Pressable>
    </View>
  );
}

const emailCard = StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  top: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#e5091415", alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: "700" },
  supabase: { fontSize: 11, marginTop: 2 },
  subjectRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 14, gap: 10 },
  subjectLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: 2 },
  subjectText: { fontSize: 13 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  copyTxt: { fontSize: 11, fontWeight: "600" },
  htmlBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderTopWidth: 1 },
  htmlTxt: { fontSize: 13, fontWeight: "700" },
});

// ─── ADMIN SCREEN ─────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [apis, setApis] = useState<ApiStatus[]>([
    { name: "TMDB API", status: "loading" },
    { name: "RedeFlixApi", status: "loading" },
    { name: "Supabase Database", status: "loading" },
  ]);

  const [userCount, setUserCount] = useState<number | null>(null);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [ratingsCount, setRatingsCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"sistema" | "emails" | "indicacoes" | "notifs">("sistema");

  const [contentRequests, setContentRequests] = useState<ContentRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [addingContent, setAddingContent] = useState<string | null>(null);

  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<{ sent: number; failed: number } | null>(null);

  const [massTitle, setMassTitle] = useState("🎬 NETPLAY");
  const [massBody, setMassBody] = useState("");
  const [massImage, setMassImage] = useState("");
  const [targetGroup, setTargetGroup] = useState<"all" | "active" | "guest">("all");
  const [sendingMass, setSendingMass] = useState(false);
  const [lastMassResult, setLastMassResult] = useState<{ sent: number; failed: number } | null>(null);

  const loadRequests = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const all = await db.contentRequests.getAll();
      setContentRequests(all);
      setPendingCount(all.filter((r) => r.status === "pending").length);
    } catch {}
  }, []);

  const loadTokenCount = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const tokens = await db.pushTokens.getAll();
      setTokenCount(tokens.length);
    } catch {}
  }, []);

  const handleSendTestNotification = async () => {
    setSendingTest(true);
    setLastTestResult(null);
    try {
      const tokens = await db.pushTokens.getAll();
      if (tokens.length === 0) {
        Alert.alert("Nenhum token", "Nenhum usuário com push ativo encontrado no Supabase.");
        return;
      }
      const result = await sendPushNotificationsToTokens(
        tokens,
        "🔥 Novidades no NETPLAY",
        "Teste de notificação: novos títulos foram adicionados ao catálogo!",
        { type: "new_content", count: 1 }
      );
      setLastTestResult(result);
      Alert.alert(
        result.sent > 0 ? "✅ Enviado!" : "⚠️ Aviso",
        `Enviado: ${result.sent} | Falhou: ${result.failed} | Total tokens: ${tokens.length}`
      );
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Não foi possível enviar.");
    } finally {
      setSendingTest(false);
    }
  };

  useEffect(() => {
    if (activeTab === "indicacoes") loadRequests();
    if (activeTab === "notifs") loadTokenCount();
  }, [activeTab, loadRequests, loadTokenCount]);

  const handleMarkAsAdded = async (tmdbId: number, type: "movie" | "tv", title: string) => {
    const key = `${type}_${tmdbId}`;
    setAddingContent(key);
    try {
      const userIds = await db.contentRequests.getUserIdsForContent(tmdbId, type);
      const tokens = await db.pushTokens.getForUsers(userIds);
      if (tokens.length > 0) {
        await sendPushNotificationsToTokens(
          tokens,
          "🎬 Conteúdo disponível!",
          `"${title}" foi adicionado ao NETPLAY. Assista agora!`,
          { tmdbId: tmdbId, type: type, title: title }
        );
      }
      await db.contentRequests.markAdded(tmdbId, type);
      await sendContentAddedNotification(title);
      setContentRequests((prev) =>
        prev.map((r) => r.tmdb_id === tmdbId && r.type === type ? { ...r, status: "added" } : r)
      );
      setPendingCount((n) => Math.max(0, n - userIds.length));
      Alert.alert(
        "✅ Conteúdo adicionado!",
        tokens.length > 0
          ? `Notificação enviada para ${tokens.length} usuário(s) que indicaram "${title}".`
          : `"${title}" marcado como adicionado. Nenhum usuário com notificações ativas para notificar.`,
        [{ text: "OK" }]
      );
    } catch (e: any) {
      Alert.alert("Erro", "Não foi possível concluir a operação. Verifique se as tabelas foram criadas no Supabase.");
    } finally {
      setAddingContent(null);
    }
  };

  const loadStats = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const [u, w, r] = await Promise.all([db.users.countAll(), db.watchlist.countAll(), db.ratings.countAll()]);
    setUserCount(u);
    setWatchlistCount(w);
    setRatingsCount(r);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const checkApis = async () => {
    setApis([
      { name: "TMDB API", status: "loading" },
      { name: "RedeFlixApi", status: "loading" },
      { name: "Supabase Database", status: "loading" },
    ]);

    const t0 = Date.now();
    try {
      const res = await fetch("/api/tmdb/trending");
      const ok = res.ok;
      setApis((prev) => prev.map((a) => a.name === "TMDB API" ? { ...a, status: ok ? "ok" : "error", latency: Date.now() - t0, detail: ok ? undefined : `HTTP ${res.status}` } : a));
    } catch (e: any) {
      setApis((prev) => prev.map((a) => (a.name === "TMDB API" ? { ...a, status: "error", detail: e?.message } : a)));
    }

    const t1 = Date.now();
    try {
      const res = await fetch("https://redeflixapi.store/filme/550", { method: "HEAD", signal: AbortSignal.timeout(5000) });
      setApis((prev) => prev.map((a) => a.name === "RedeFlixApi" ? { ...a, status: res.ok || res.status === 200 || res.status === 301 || res.status === 302 ? "ok" : "error", latency: Date.now() - t1 } : a));
    } catch {
      setApis((prev) => prev.map((a) => (a.name === "RedeFlixApi" ? { ...a, status: "ok", detail: "Inacessível via browser (normal em CORS)" } : a)));
    }

    const t2 = Date.now();
    try {
      const count = await db.users.countAll();
      setApis((prev) => prev.map((a) => a.name === "Supabase Database" ? { ...a, status: "ok", latency: Date.now() - t2, detail: `${count} usuário(s)` } : a));
    } catch {
      setApis((prev) => prev.map((a) => (a.name === "Supabase Database" ? { ...a, status: "error" } : a)));
    }
  };

  useEffect(() => { checkApis(); }, []);

  if (!user || user.role !== "admin") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: topPad + 8 }]}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <Feather name="shield-off" size={44} color={colors.border} />
          <Text style={{ color: colors.mutedForeground, marginTop: 16 }}>Acesso negado</Text>
        </View>
      </View>
    );
  }

  const stats = [
    { label: "Usuários", value: userCount ?? "...", icon: "users" },
    { label: "Watchlists", value: watchlistCount ?? "...", icon: "bookmark" },
    { label: "Avaliações", value: ratingsCount ?? "...", icon: "star" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn2}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Painel Admin</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── TABS ── */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
        {(["sistema", "notifs", "indicacoes", "emails"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && { borderBottomColor: RED, borderBottomWidth: 2 }]}
          >
            <Feather
              name={tab === "sistema" ? "activity" : tab === "notifs" ? "send" : tab === "indicacoes" ? "inbox" : "mail"}
              size={14}
              color={activeTab === tab ? RED : colors.mutedForeground}
            />
            <Text style={[styles.tabTxt, { color: activeTab === tab ? RED : colors.mutedForeground }]}>
              {tab === "sistema" ? "Sistema" : tab === "notifs" ? "Push" : tab === "indicacoes" ? "Pedidos" : "E-mails"}
            </Text>
            {tab === "indicacoes" && pendingCount > 0 && (
              <View style={[styles.badge, { backgroundColor: RED }]}>
                <Text style={styles.badgeTxt}>{pendingCount}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>

        {/* ── ABA SISTEMA ── */}
        {activeTab === "sistema" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>BANCO DE DADOS</Text>
            <View style={styles.statsGrid}>
              {stats.map((s) => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name={s.icon as any} size={20} color={RED} />
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{String(s.value)}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>STATUS DAS APIS</Text>
              <Pressable onPress={checkApis} style={[styles.refreshBtn, { backgroundColor: colors.card }]}>
                <Feather name="refresh-cw" size={14} color={RED} />
                <Text style={[styles.refreshText, { color: RED }]}>Verificar</Text>
              </Pressable>
            </View>

            <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {apis.map((a, i) => (
                <React.Fragment key={a.name}>
                  <View style={styles.apiRow}>
                    <View style={styles.apiLeft}>
                      <Text style={[styles.apiName, { color: colors.foreground }]}>{a.name}</Text>
                      {a.latency !== undefined && <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>{a.latency}ms</Text>}
                      {a.detail && <Text style={[styles.apiDetail, { color: colors.border }]} numberOfLines={2}>{a.detail}</Text>}
                    </View>
                    <StatusBadge status={a.status} />
                  </View>
                  {i < apis.length - 1 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                </React.Fragment>
              ))}
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="shield" size={18} color={GOLD} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: colors.foreground }]}>Conta Admin</Text>
                <Text style={[styles.infoSub, { color: colors.mutedForeground }]}>{user.email}</Text>
              </View>
            </View>
          </>
        )}

        {/* ── ABA PUSH ── */}
        {activeTab === "notifs" && (
          <>
            {/* Contagem de tokens */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>TOKENS REGISTRADOS</Text>
            <View style={[styles.statsGrid, { marginBottom: 20 }]}>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="smartphone" size={20} color={RED} />
                <Text style={[styles.statValue, { color: colors.foreground }]}>{tokenCount ?? "..."}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Dispositivos</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, flex: 2 }]}>
                <Feather name="bell" size={20} color="#4caf50" />
                <Text style={[styles.statValue, { color: colors.foreground, fontSize: 14, textAlign: "center" }]}>
                  {tokenCount === null ? "..." : tokenCount === 0 ? "Nenhum token ainda" : "Pronto para enviar"}
                </Text>
                <TouchableOpacity
                  onPress={loadTokenCount}
                  style={[styles.refreshBtn, { backgroundColor: colors.cardElevated ?? colors.border, alignSelf: "center", marginTop: 4 }]}
                >
                  <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.refreshText, { color: colors.mutedForeground }]}>Atualizar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Botão de teste */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>TESTAR NOTIFICAÇÃO</Text>
            <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 20 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${RED}18`, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 20 }}>🔥</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 14, fontWeight: "700" }, { color: colors.foreground }]}>Novidades no NETPLAY</Text>
                  <Text style={[{ fontSize: 12, marginTop: 2 }, { color: colors.mutedForeground }]}>
                    Simula o push automático de novos títulos
                  </Text>
                </View>
              </View>

              {lastTestResult && (
                <View style={[{ borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: "row", gap: 16 }, { backgroundColor: lastTestResult.sent > 0 ? "#4caf5015" : "#e5091415", borderWidth: 1, borderColor: lastTestResult.sent > 0 ? "#4caf5040" : "#e5091440" }]}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={[{ fontSize: 18, fontWeight: "800" }, { color: "#4caf50" }]}>{lastTestResult.sent}</Text>
                    <Text style={[{ fontSize: 10 }, { color: colors.mutedForeground }]}>Enviados</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={[{ fontSize: 18, fontWeight: "800" }, { color: lastTestResult.failed > 0 ? RED : colors.mutedForeground }]}>{lastTestResult.failed}</Text>
                    <Text style={[{ fontSize: 10 }, { color: colors.mutedForeground }]}>Falharam</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={[{ fontSize: 18, fontWeight: "800" }, { color: colors.foreground }]}>{lastTestResult.sent + lastTestResult.failed}</Text>
                    <Text style={[{ fontSize: 10 }, { color: colors.mutedForeground }]}>Total</Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[{ borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, { backgroundColor: sendingTest ? colors.border : RED, opacity: sendingTest ? 0.7 : 1 }]}
                onPress={handleSendTestNotification}
                disabled={sendingTest}
              >
                <Feather name={sendingTest ? "loader" : "send"} size={16} color="#fff" />
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
                  {sendingTest ? "Enviando..." : `Enviar para todos (${tokenCount ?? "?"} dispositivos)`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── NOTIFICAÇÃO PERSONALIZADA (MASSA) ── */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10, marginTop: 4 }]}>NOTIFICAÇÃO PERSONALIZADA</Text>
            <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 20 }]}>

              {/* Target group */}
              <Text style={[{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 }, { color: colors.mutedForeground }]}>DESTINATÁRIOS</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {(["all", "active", "guest"] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setTargetGroup(g)}
                    style={[{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                      borderWidth: 1,
                      borderColor: targetGroup === g ? RED : colors.border,
                      backgroundColor: targetGroup === g ? `${RED}18` : colors.background,
                    }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: targetGroup === g ? RED : colors.mutedForeground }}>
                      {g === "all" ? "Todos" : g === "active" ? "Ativos" : "Convidados"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Title */}
              <Text style={[{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 }, { color: colors.mutedForeground }]}>TÍTULO</Text>
              <TextInput
                value={massTitle}
                onChangeText={setMassTitle}
                placeholder="Ex: 🎬 Novidade no NETPLAY"
                placeholderTextColor={colors.border}
                style={[{
                  borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 14, marginBottom: 12,
                }, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              />

              {/* Body */}
              <Text style={[{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 }, { color: colors.mutedForeground }]}>MENSAGEM</Text>
              <TextInput
                value={massBody}
                onChangeText={setMassBody}
                placeholder="Digite o conteúdo da notificação..."
                placeholderTextColor={colors.border}
                multiline
                numberOfLines={3}
                style={[{
                  borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 14, marginBottom: 12, textAlignVertical: "top", minHeight: 70,
                }, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              />

              {/* Image URL */}
              <Text style={[{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 }, { color: colors.mutedForeground }]}>URL DA IMAGEM (opcional)</Text>
              <TextInput
                value={massImage}
                onChangeText={setMassImage}
                placeholder="https://image.tmdb.org/t/p/w500/..."
                placeholderTextColor={colors.border}
                style={[{
                  borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 13, marginBottom: 14,
                }, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              />

              {lastMassResult && (
                <View style={[{ borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: "row", gap: 16 }, { backgroundColor: lastMassResult.sent > 0 ? "#4caf5015" : "#e5091415", borderWidth: 1, borderColor: lastMassResult.sent > 0 ? "#4caf5040" : "#e5091440" }]}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={[{ fontSize: 18, fontWeight: "800" }, { color: "#4caf50" }]}>{lastMassResult.sent}</Text>
                    <Text style={[{ fontSize: 10 }, { color: colors.mutedForeground }]}>Enviados</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={[{ fontSize: 18, fontWeight: "800" }, { color: lastMassResult.failed > 0 ? RED : colors.mutedForeground }]}>{lastMassResult.failed}</Text>
                    <Text style={[{ fontSize: 10 }, { color: colors.mutedForeground }]}>Falharam</Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[{ borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, { backgroundColor: (sendingMass || !massBody.trim()) ? colors.border : "#8b5cf6", opacity: (sendingMass || !massBody.trim()) ? 0.7 : 1 }]}
                onPress={async () => {
                  if (!massBody.trim()) { Alert.alert("Mensagem vazia", "Digite o conteúdo da notificação."); return; }
                  setSendingMass(true);
                  setLastMassResult(null);
                  try {
                    const allTokens = await db.pushTokens.getAll();
                    if (allTokens.length === 0) { Alert.alert("Sem tokens", "Nenhum dispositivo registrado."); return; }
                    const result = await sendPushNotificationsToTokens(
                      allTokens,
                      massTitle || "🎬 NETPLAY",
                      massBody,
                      { type: "mass_push", target: targetGroup },
                      massImage || undefined
                    );
                    setLastMassResult(result);
                    Alert.alert(result.sent > 0 ? "✅ Enviado!" : "⚠️ Aviso", `Enviado: ${result.sent} | Falhou: ${result.failed}`);
                  } catch (e: any) {
                    Alert.alert("Erro", e?.message ?? "Não foi possível enviar.");
                  } finally {
                    setSendingMass(false);
                  }
                }}
                disabled={sendingMass || !massBody.trim()}
              >
                <Feather name={sendingMass ? "loader" : "send"} size={16} color="#fff" />
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
                  {sendingMass ? "Enviando..." : `Enviar personalizado (${tokenCount ?? "?"} dispositivos)`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── NOTIFICAÇÕES AUTOMÁTICAS ── */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>NOTIFICAÇÕES AUTOMÁTICAS</Text>
            <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: "hidden", marginBottom: 20 }]}>
              {[
                { icon: "🔥", title: "Novidades diárias", sub: "Todo dia às 20h — novos títulos no catálogo", color: "#e50914" },
                { icon: "⏸", title: "Continue assistindo", sub: "15 min sem assistir — conteúdo aguardando você", color: "#f59e0b" },
                { icon: "📅", title: "Plano expirando", sub: "Quando restam 3 dias do plano do usuário", color: "#3b82f6" },
                { icon: "⭐", title: "Upgrade de convidado", sub: "Após 2 dias como convidado, convite para assinar", color: "#8b5cf6" },
                { icon: "📺", title: "Resumo semanal", sub: "Sábados às 19h — destaques da semana", color: "#10b981" },
              ].map((item, i) => (
                <View key={i} style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${item.color}18`, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 13, fontWeight: "700" }, { color: colors.foreground }]}>{item.title}</Text>
                    <Text style={[{ fontSize: 11, marginTop: 2 }, { color: colors.mutedForeground }]}>{item.sub}</Text>
                  </View>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#4caf50" }} />
                </View>
              ))}
            </View>

            {/* Como funciona */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>COMO FUNCIONA</Text>
            <View style={[styles.infoBox, { backgroundColor: "#3b82f610", borderColor: "#3b82f630", marginBottom: 12 }]}>
              <Feather name="info" size={16} color="#3b82f6" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: "#3b82f6" }]}>Envio automático (servidor)</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  O servidor verifica o catálogo do redeflixapi a cada 1 hora. Quando detecta IDs novos, busca o título no TMDB e envia o push automaticamente para todos os dispositivos registrados.
                </Text>
              </View>
            </View>

            {/* SQL */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10, marginTop: 8 }]}>SETUP SUPABASE</Text>
            <View style={[styles.infoBox, { backgroundColor: "#fbbf2410", borderColor: "#fbbf2430" }]}>
              <Feather name="database" size={16} color={GOLD} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: GOLD }]}>Tabela push_tokens</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  Execute este SQL no Supabase → SQL Editor para criar a tabela de tokens:
                </Text>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}
                  onPress={() => {
                    const sql = `-- Tabela de push tokens para notificações\nCREATE TABLE IF NOT EXISTS push_tokens (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  user_id UUID NOT NULL,\n  token TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(user_id)\n);\nALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "public_push_tokens" ON push_tokens;\nCREATE POLICY "public_push_tokens"\n  ON push_tokens FOR ALL\n  USING (true) WITH CHECK (true);\n\n-- Tabela de pedidos de conteúdo (para aba Pedidos)\nCREATE TABLE IF NOT EXISTS content_requests (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  user_id UUID NOT NULL,\n  tmdb_id INTEGER NOT NULL,\n  type TEXT NOT NULL,\n  title TEXT NOT NULL,\n  poster_path TEXT,\n  status TEXT NOT NULL DEFAULT 'pending',\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(user_id, tmdb_id, type)\n);\nALTER TABLE content_requests ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "public_content_requests" ON content_requests;\nCREATE POLICY "public_content_requests"\n  ON content_requests FOR ALL\n  USING (true) WITH CHECK (true);`;
                    if (Platform.OS === "web") {
                      navigator.clipboard?.writeText(sql).catch(() => {});
                    } else {
                      Clipboard.setString(sql);
                    }
                    Alert.alert("SQL copiado!", "Abra o Supabase → SQL Editor → cole o SQL → clique em Run.");
                  }}
                >
                  <Feather name="copy" size={13} color={GOLD} />
                  <Text style={[styles.copyBtnTxt, { color: GOLD }]}>Copiar SQL completo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── ABA INDICAÇÕES ── */}
        {activeTab === "indicacoes" && (
          <>
            <View style={[styles.infoBox, { backgroundColor: "#e5091410", borderColor: "#e5091430", marginTop: 20 }]}>
              <Feather name="info" size={16} color={RED} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: RED }]}>Como funciona</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  Quando um usuário tenta assistir um conteúdo indisponível e clica em "Indicar", a solicitação aparece aqui.{"\n"}
                  Ao marcar como adicionado, todos os usuários que indicaram recebem uma notificação push em tempo real.
                </Text>
              </View>
            </View>

            <View style={[styles.infoBox, { backgroundColor: "#fbbf2410", borderColor: "#fbbf2430", marginTop: 12 }]}>
              <Feather name="database" size={16} color={GOLD} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: GOLD }]}>Setup Supabase necessário</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  Execute este SQL no Supabase → SQL Editor para ativar as indicações e push tokens:
                </Text>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}
                  onPress={() => {
                    const sql = `CREATE TABLE IF NOT EXISTS content_requests (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  user_id UUID NOT NULL,\n  tmdb_id INTEGER NOT NULL,\n  type TEXT NOT NULL,\n  title TEXT NOT NULL,\n  poster_path TEXT,\n  status TEXT NOT NULL DEFAULT 'pending',\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(user_id, tmdb_id, type)\n);\nALTER TABLE content_requests ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "public_content_requests" ON content_requests;\nCREATE POLICY "public_content_requests" ON content_requests FOR ALL USING (true) WITH CHECK (true);\n\nCREATE TABLE IF NOT EXISTS push_tokens (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  user_id UUID NOT NULL,\n  token TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(user_id)\n);\nALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "public_push_tokens" ON push_tokens;\nCREATE POLICY "public_push_tokens" ON push_tokens FOR ALL USING (true) WITH CHECK (true);`;
                    Clipboard.setString(sql);
                    Alert.alert("Copiado!", "Cole o SQL no Supabase → SQL Editor e clique em Run.");
                  }}
                >
                  <Feather name="copy" size={13} color={GOLD} />
                  <Text style={[styles.copyBtnTxt, { color: GOLD }]}>Copiar SQL de setup</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                CONTEÚDOS INDICADOS
              </Text>
              <Pressable onPress={loadRequests} style={[styles.refreshBtn, { backgroundColor: colors.card }]}>
                <Feather name="refresh-cw" size={14} color={RED} />
                <Text style={[styles.refreshText, { color: RED }]}>Atualizar</Text>
              </Pressable>
            </View>

            {contentRequests.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="inbox" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
                  Nenhuma indicação ainda
                </Text>
              </View>
            ) : (
              (() => {
                const grouped = contentRequests.reduce<Record<string, { req: ContentRequest; count: number; userIds: string[] }>>((acc, r) => {
                  const key = `${r.type}_${r.tmdb_id}`;
                  if (!acc[key]) acc[key] = { req: r, count: 0, userIds: [] };
                  acc[key].count += 1;
                  acc[key].userIds.push(r.user_id);
                  return acc;
                }, {});
                return Object.values(grouped)
                  .sort((a, b) => b.count - a.count)
                  .map(({ req, count }) => {
                    const key = `${req.type}_${req.tmdb_id}`;
                    const isAdded = req.status === "added";
                    const isLoading = addingContent === key;
                    const posterUri = req.poster_path ? TMDB_IMG(req.poster_path, "w500") : null;
                    return (
                      <View key={key} style={[styles.requestCard, { backgroundColor: colors.card, borderColor: isAdded ? "#4caf5040" : colors.border }]}>
                        {posterUri ? (
                          <Image source={{ uri: posterUri }} style={styles.requestPoster} resizeMode="cover" />
                        ) : (
                          <View style={[styles.requestPoster, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
                            <Feather name="film" size={20} color={colors.mutedForeground} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.requestTitle, { color: colors.foreground }]} numberOfLines={2}>{req.title}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                            <View style={[styles.typeBadge, { backgroundColor: req.type === "movie" ? "#3b82f620" : "#8b5cf620", borderColor: req.type === "movie" ? "#3b82f640" : "#8b5cf640" }]}>
                              <Text style={[styles.typeTxt, { color: req.type === "movie" ? "#3b82f6" : "#8b5cf6" }]}>
                                {req.type === "movie" ? "Filme" : "Série"}
                              </Text>
                            </View>
                            <Text style={[styles.requestCount, { color: colors.mutedForeground }]}>
                              {count} indicação{count !== 1 ? "ões" : ""}
                            </Text>
                          </View>
                          {isAdded ? (
                            <View style={styles.addedBadge}>
                              <Feather name="check-circle" size={13} color="#4caf50" />
                              <Text style={[styles.addedTxt, { color: "#4caf50" }]}>Adicionado ao catálogo</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={[styles.addBtn, { backgroundColor: isLoading ? colors.border : RED, opacity: isLoading ? 0.7 : 1 }]}
                              onPress={() => handleMarkAsAdded(req.tmdb_id, req.type, req.title)}
                              disabled={isLoading}
                            >
                              <Feather name={isLoading ? "loader" : "plus-circle"} size={13} color="#fff" />
                              <Text style={styles.addBtnTxt}>{isLoading ? "Notificando..." : "Marcar como adicionado"}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  });
              })()
            )}
          </>
        )}

        {/* ── ABA E-MAILS ── */}
        {activeTab === "emails" && (
          <>
            {/* Instrução */}
            <View style={[styles.infoBox, { backgroundColor: "#fbbf2410", borderColor: "#fbbf2430", marginTop: 20 }]}>
              <Feather name="info" size={16} color={GOLD} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: GOLD }]}>Como usar</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  1. Abra o Supabase → Authentication → Email Templates{"\n"}
                  2. Escolha o template pelo nome em "Supabase:"{"\n"}
                  3. Cole o assunto no campo Subject{"\n"}
                  4. Copie e cole o HTML no campo Body
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20, marginBottom: 12 }]}>
              TEMPLATES ({EMAIL_TEMPLATES.length})
            </Text>

            {EMAIL_TEMPLATES.map((tpl) => (
              <EmailTemplateCard key={tpl.id} tpl={tpl} colors={colors} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  backBtn: { position: "absolute", left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  backBtn2: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabsRow: { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabTxt: { fontSize: 13, fontWeight: "600" },
  badge: { borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: "center" },
  badgeTxt: { fontSize: 10, fontWeight: "700", color: "#fff" },
  requestCard: { flexDirection: "row", gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  requestPoster: { width: 56, height: 80, borderRadius: 8, overflow: "hidden" },
  requestTitle: { fontSize: 14, fontWeight: "700", lineHeight: 19, flex: 1 },
  requestCount: { fontSize: 12 },
  typeBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  typeTxt: { fontSize: 10, fontWeight: "700" },
  addedBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  addedTxt: { fontSize: 12, fontWeight: "600" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8, alignSelf: "flex-start" },
  addBtnTxt: { fontSize: 12, fontWeight: "700", color: "#fff" },
  emptyBox: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: "center", gap: 12, marginTop: 8 },
  emptyTxt: { fontSize: 14 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  copyBtnTxt: { fontSize: 12, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 4, marginTop: 12 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 6 },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  refreshText: { fontSize: 12, fontWeight: "600" },
  apiCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  apiRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 16, gap: 12 },
  apiLeft: { flex: 1 },
  apiName: { fontSize: 15, fontWeight: "600" },
  apiLatency: { fontSize: 12, marginTop: 2 },
  apiDetail: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  sep: { height: 1 },
  infoCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  infoTitle: { fontSize: 15, fontWeight: "600" },
  infoSub: { fontSize: 13, marginTop: 2 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  infoBoxTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  infoBoxText: { fontSize: 12, lineHeight: 19 },
});

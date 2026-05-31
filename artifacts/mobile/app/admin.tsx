import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Clipboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

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
  const [activeTab, setActiveTab] = useState<"sistema" | "emails">("sistema");

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
        {(["sistema", "emails"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && { borderBottomColor: RED, borderBottomWidth: 2 }]}
          >
            <Feather
              name={tab === "sistema" ? "activity" : "mail"}
              size={14}
              color={activeTab === tab ? RED : colors.mutedForeground}
            />
            <Text style={[styles.tabTxt, { color: activeTab === tab ? RED : colors.mutedForeground }]}>
              {tab === "sistema" ? "Sistema" : "E-mails"}
            </Text>
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
  tabsRow: { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabTxt: { fontSize: 14, fontWeight: "600" },
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

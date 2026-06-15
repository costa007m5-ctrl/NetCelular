import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

function mkSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentRequest, ContentReport } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { sendPushNotificationsToTokens, sendContentAddedNotification, sendPushViaServer } from "@/lib/notifications";
import { TMDB_IMG, getApiBase, setApiDomain, getApiDomainDisplay } from "@/lib/api";
import { checkDriveApi, searchDriveByTitle, DriveMatch } from "@/lib/gdrive-search";
import { listFolderAll, DRIVE_ROOTS, isFolder, isVideo, formatSize } from "@/lib/gdrive-index";
import { TeraboxWebViewResolver } from "@/lib/terabox-webview-resolver";

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
  const { user, loading: authLoading } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [apis, setApis] = useState<ApiStatus[]>([
    { name: "TMDB API", status: "loading" },
    { name: "RedeFlixApi", status: "loading" },
    { name: "Supabase Database", status: "loading" },
  ]);

  const [userCount, setUserCount] = useState<number | null>(null);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [ratingsCount, setRatingsCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"sistema" | "emails" | "indicacoes" | "notifs" | "acervo" | "gstream" | "warez" | "terabox" | "contas" | "firebase" | "logs">("sistema");
  const [logsData, setLogsData] = useState<Array<{ id: number; level: string; category: string; message: string; details?: any; userId?: string; device?: string; createdAt: string }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState<"all" | "error" | "warn" | "info">("all");
  const [logsExpanded, setLogsExpanded] = useState<Set<number>>(new Set());
  const [contasData, setContasData] = useState<Array<{ user: any; sub: any }>>([]);

  const [serverDomainInput, setServerDomainInput] = useState(() => getApiDomainDisplay().replace(/^\(.*\)$/, ""));
  const [serverSaving, setServerSaving] = useState(false);
  const [serverSaved, setServerSaved] = useState(false);

  const [serverIp, setServerIp] = useState<string | null>(null);
  const [serverIpLoading, setServerIpLoading] = useState(false);

  const [fcmStats, setFcmStats] = useState<{ total: number; expo: number; native: number; fcmV1Active?: boolean } | null>(null);
  const [fcmStatsLoading, setFcmStatsLoading] = useState(false);
  const [fcmTestTitle, setFcmTestTitle] = useState("🔔 Teste FCM - NETPLAY");
  const [fcmTestBody, setFcmTestBody] = useState("Notificação de teste via Firebase Cloud Messaging.");
  const [fcmTestImage, setFcmTestImage] = useState("");
  const [fcmTestResult, setFcmTestResult] = useState<{ sent: number; failed: number; skipped: number; total: number; errors?: { token: string; error: string; message?: string }[] } | null>(null);
  const [fcmTesting, setFcmTesting] = useState(false);
  const [contasLoading, setContasLoading] = useState(false);
  const [activatingUser, setActivatingUser] = useState<string | null>(null);
  const [blockingUser, setBlockingUser] = useState<string | null>(null);

  // ── GStream state ──────────────────────────────────────────────────────────
  const [gSection, setGSection] = useState<"dashboard" | "filmes" | "series" | "animes" | "api">("dashboard");
  const [gApiStatus, setGApiStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gApiLatency, setGApiLatency] = useState<number | null>(null);

  const [gMovieId, setGMovieId] = useState("");
  const [gMovieLoading, setGMovieLoading] = useState(false);
  const [gMovieResult, setGMovieResult] = useState<"idle" | "found" | "notfound">("idle");
  const [gMovieUrl, setGMovieUrl] = useState("");
  const [gMovieTitle, setGMovieTitle] = useState("");

  const [gCatalogSearch, setGCatalogSearch] = useState("");
  const [gCatalogLoading, setGCatalogLoading] = useState(false);
  const [gCatalogResults, setGCatalogResults] = useState<Array<{ id: number; title: string; embed: string; image: string; preview: string }>>([]);
  const [gCatalogTotal, setGCatalogTotal] = useState<number | null>(null);

  const [gTvId, setGTvId] = useState("");
  const [gTvSeason, setGTvSeason] = useState("1");
  const [gTvEpisode, setGTvEpisode] = useState("1");
  const [gTvLoading, setGTvLoading] = useState(false);
  const [gTvResult, setGTvResult] = useState<{ dub: boolean; leg: boolean } | null>(null);
  const [gTvDubUrl, setGTvDubUrl] = useState("");
  const [gTvLegUrl, setGTvLegUrl] = useState("");

  const [gAnimeId, setGAnimeId] = useState("");
  const [gAnimeSeason, setGAnimeSeason] = useState("1");
  const [gAnimeEpisode, setGAnimeEpisode] = useState("1");
  const [gAnimeLoading, setGAnimeLoading] = useState(false);
  const [gAnimeResult, setGAnimeResult] = useState<{ dub: boolean; leg: boolean } | null>(null);
  const [gAnimeDubUrl, setGAnimeDubUrl] = useState("");
  const [gAnimeLegUrl, setGAnimeLegUrl] = useState("");

  const [gPlayerVisible, setGPlayerVisible] = useState(false);
  const [gPlayerUrl, setGPlayerUrl] = useState("");
  const [gPlayerTitle, setGPlayerTitle] = useState("");

  const EMBED_BASE = "https://embed.embedplayer.site";

  // ── Terabox state ───────────────────────────────────────────────────────────
  interface TbFile { fs_id: string; server_filename: string; path: string; isdir: number; size: number; category: number; }
  const [tbInputUrl, setTbInputUrl] = useState("https://www.terabox.app/wap/share/filelist?surl=YvIpBr3CaDXDWg5gFTviYA&path=%2Fchaves");
  const [tbSurl, setTbSurl] = useState("");
  const [tbFiles, setTbFiles] = useState<TbFile[]>([]);
  const [tbLoading, setTbLoading] = useState(false);
  const [tbError, setTbError] = useState<string | null>(null);
  const [tbCurrentPath, setTbCurrentPath] = useState("/");
  const [tbBreadcrumb, setTbBreadcrumb] = useState<{ label: string; path: string }[]>([]);
  const [tbResolverVisible, setTbResolverVisible] = useState(false);
  const [tbResolverUrl, setTbResolverUrl] = useState("");
  const [tbPlayerVisible, setTbPlayerVisible] = useState(false);
  const [tbPlayerUrl, setTbPlayerUrl] = useState("");
  const [tbPlayerTitle, setTbPlayerTitle] = useState("");

  function parseTbSurl(url: string): { surl: string; path: string } | null {
    try {
      const u = new URL(url.trim());
      const surl = u.searchParams.get("surl") ?? "";
      const path = u.searchParams.get("path") ?? "/";
      if (!surl) return null;
      return { surl, path };
    } catch { return null; }
  }

  const loadTbFiles = async (surl: string, dir: string) => {
    setTbLoading(true);
    setTbError(null);
    setTbFiles([]);
    try {
      const base = getApiBase();
      const apiUrl = `${base}/terabox/list?surl=${encodeURIComponent(surl)}&dir=${encodeURIComponent(dir)}`;
      const res = await fetch(apiUrl, { signal: mkSignal(20000) });
      const json = await res.json();
      if (!res.ok) {
        setTbError(`Erro ${res.status}: ${json.error ?? "resposta inválida do servidor"}`);
        return;
      }
      if (json.errno !== 0 && json.errno !== undefined) {
        setTbError(`Terabox retornou erro ${json.errno}: ${json.errmsg ?? "erro desconhecido"}`);
        return;
      }
      const list: TbFile[] = (json.list ?? json.data?.list ?? []).map((f: any) => ({
        fs_id: String(f.fs_id ?? ""),
        server_filename: f.server_filename ?? f.filename ?? "",
        path: f.path ?? "",
        isdir: f.isdir ?? 0,
        size: f.size ?? 0,
        category: f.category ?? 0,
      }));
      setTbFiles(list);
      if (list.length === 0) setTbError("Nenhum arquivo encontrado nesta pasta.");
    } catch (e: any) {
      setTbError("Falha ao carregar arquivos: " + (e?.message ?? "erro desconhecido"));
    } finally {
      setTbLoading(false);
    }
  };

  const openTbFolder = (surl: string, file: TbFile) => {
    const newPath = file.path;
    setTbCurrentPath(newPath);
    setTbBreadcrumb((prev) => [...prev, { label: file.server_filename, path: newPath }]);
    loadTbFiles(surl, newPath);
  };

  const tbNavigateTo = (surl: string, path: string, idx: number) => {
    setTbCurrentPath(path);
    setTbBreadcrumb((prev) => prev.slice(0, idx));
    loadTbFiles(surl, path);
  };

  const playTbFile = async (surl: string, file: TbFile) => {
    const wapUrl = `https://www.terabox.com/wap/share/filelist?surl=${surl}&path=${encodeURIComponent(file.path)}`;
    setTbPlayerTitle(file.server_filename);
    if (Platform.OS === "web") {
      // Web: load Terabox WAP page via our reverse proxy (strips X-Frame-Options for iframe embed)
      const apiBase = await getApiBase();
      const proxyUrl = `${apiBase}/api/terabox/proxy-page?url=${encodeURIComponent(wapUrl)}`;
      setTbPlayerUrl(proxyUrl);
      setTbPlayerVisible(true);
    } else {
      // Native: use hidden WebView resolver to capture direct stream URL
      setTbResolverUrl(wapUrl);
      setTbResolverVisible(true);
    }
  };

  function tbFormatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function isTbVideo(f: TbFile): boolean {
    return f.category === 1 || /\.(mp4|mkv|avi|mov|ts|m3u8|flv|wmv|webm|rmvb)$/i.test(f.server_filename);
  }

  // ── WarezCDN state ──────────────────────────────────────────────────────────
  const WAREZ_BASE = "https://warezcdn.lat";
  const [wSection, setWSection] = useState<"player" | "catalogo" | "canais" | "eventos" | "pesquisa">("player");
  const [wLoading, setWLoading] = useState(false);
  const [wError, setWError] = useState<string | null>(null);
  const [wResults, setWResults] = useState<any[]>([]);
  const [wSearch, setWSearch] = useState("");
  const [wGenre, setWGenre] = useState("");
  const [wCategory, setWCategory] = useState<"filme" | "serie" | "anime" | "dorama">("filme");
  const [wEventSport, setWEventSport] = useState("");
  const [wChannelQ, setWChannelQ] = useState("");
  const [wPlayerVisible, setWPlayerVisible] = useState(false);
  const [wPlayerUrl, setWPlayerUrl] = useState("");
  const [wPlayerTitle, setWPlayerTitle] = useState("");
  const [wEmbedType, setWEmbedType] = useState<"filme" | "serie">("filme");
  const [wEmbedId, setWEmbedId] = useState("");
  const [wEmbedSeason, setWEmbedSeason] = useState("1");
  const [wEmbedEpisode, setWEmbedEpisode] = useState("1");

  const checkGStreamApi = async () => {
    setGApiStatus("loading");
    const t = Date.now();
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/gstream/status`, { signal: mkSignal(10000) });
      const json = await res.json().catch(() => null);
      setGApiLatency(Date.now() - t);
      setGApiStatus(json?.online ? "ok" : "error");
    } catch {
      setGApiStatus("error");
      setGApiLatency(null);
    }
  };

  const checkGStreamMovie = async (overrideId?: string, overrideTitle?: string) => {
    const id = (overrideId ?? gMovieId).trim();
    if (!id) return;
    setGMovieLoading(true);
    setGMovieResult("idle");
    if (overrideTitle) setGMovieTitle(overrideTitle);
    else if (!overrideId) setGMovieTitle("");
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/gstream/check-movie?id=${encodeURIComponent(id)}`, { signal: mkSignal(10000) });
      const json = await res.json().catch(() => null);
      if (json?.movie) {
        setGMovieUrl(json.url ?? `${EMBED_BASE}/${id}`);
        if (overrideId) setGMovieId(id);
        setGMovieResult("found");
      } else {
        if (overrideId) setGMovieId(id);
        setGMovieResult("notfound");
      }
    } catch {
      setGMovieResult("notfound");
    } finally {
      setGMovieLoading(false);
    }
  };

  const searchGStreamCatalog = async (query: string) => {
    if (!query.trim()) { setGCatalogResults([]); return; }
    setGCatalogLoading(true);
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/gstream/catalog?type=filmes`, { signal: mkSignal(15000) });
      const arr: any[] = await res.json().catch(() => []);
      if (gCatalogTotal === null) setGCatalogTotal(arr.length);
      const q = query.toLowerCase();
      const filtered = arr.filter((m: any) => m.title?.toLowerCase().includes(q));
      setGCatalogResults(filtered.slice(0, 30));
    } catch {
      setGCatalogResults([]);
    } finally {
      setGCatalogLoading(false);
    }
  };

  const checkGStreamTv = async (isAnime: boolean) => {
    const id = isAnime ? gAnimeId.trim() : gTvId.trim();
    const season = isAnime ? gAnimeSeason.trim() : gTvSeason.trim();
    const ep = isAnime ? gAnimeEpisode.trim() : gTvEpisode.trim();
    if (!id) return;
    if (isAnime) { setGAnimeLoading(true); setGAnimeResult(null); }
    else { setGTvLoading(true); setGTvResult(null); }
    try {
      const base = getApiBase();
      const res = await fetch(
        `${base}/gstream/check-tv?id=${encodeURIComponent(id)}&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(ep)}`,
        { signal: mkSignal(12000) }
      );
      const json = await res.json().catch(() => null);
      const dub = !!(json?.dub);
      const leg = !!(json?.leg);
      const dubUrl = json?.dubUrl ?? `${EMBED_BASE}/tv/${id}/${season}/${ep}/dub`;
      const legUrl = json?.legUrl ?? `${EMBED_BASE}/tv/${id}/${season}/${ep}/leg`;
      if (isAnime) {
        setGAnimeResult({ dub, leg });
        setGAnimeDubUrl(dubUrl);
        setGAnimeLegUrl(legUrl);
      } else {
        setGTvResult({ dub, leg });
        setGTvDubUrl(dubUrl);
        setGTvLegUrl(legUrl);
      }
    } catch {
      if (isAnime) setGAnimeResult({ dub: false, leg: false });
      else setGTvResult({ dub: false, leg: false });
    } finally {
      if (isAnime) setGAnimeLoading(false);
      else setGTvLoading(false);
    }
  };

  const openGPlayer = (url: string, title: string) => {
    setGPlayerUrl(url);
    setGPlayerTitle(title);
    setGPlayerVisible(true);
  };

  const copyText = (text: string) => {
    if (Platform.OS === "web") {
      navigator.clipboard?.writeText(text).catch(() => {});
    } else {
      Clipboard.setString(text);
    }
  };

  // ── WarezCDN functions ──────────────────────────────────────────────────────
  const WAREZ_ADBLOCK_JS = `(function(){
    const BD=['googlesyndication','adservice.google','doubleclick.net','googletagmanager','hotmart','moatads','outbrain','taboola','propellerads','popcash','exoclick','trafficjunky','adnxs','rubiconproject','openx','pubmatic','appnexus','popads','popunder','juicyads','fuckingfast.cdn','unlockcontent','pushcrew','onesignal','pushwoosh','infinitypush','ad-maven','adcash'];
    const bl=u=>u&&BD.some(d=>u.includes(d));
    const oO=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(m,u){if(bl(u))return;oO.apply(this,arguments)};
    const oF=window.fetch;
    window.fetch=function(u,o){if(bl(typeof u==='string'?u:u?.url||''))return Promise.resolve(new Response('',{status:200}));return oF.apply(this,arguments)};
    new MutationObserver(()=>{
      document.querySelectorAll('iframe,script,ins,div[id*="ad"],div[class*="ad-"],div[class*="banner"],div[id*="banner"],div[id*="popup"],div[class*="popup"]').forEach(el=>{
        const s=el.src||el.getAttribute('data-src')||'';
        if(bl(s))el.remove();
      });
    }).observe(document.documentElement,{childList:true,subtree:true});
  })();true;`;

  const fetchWarezList = async (cat: string, q?: string, genre?: string, extra?: Record<string, string>) => {
    setWLoading(true);
    setWError(null);
    setWResults([]);
    try {
      let url = `${WAREZ_BASE}/lista?category=${cat}&format=json`;
      if (q) url += `&q=${encodeURIComponent(q)}`;
      if (genre) url += `&genero=${encodeURIComponent(genre)}`;
      if (extra) Object.entries(extra).forEach(([k, v]) => { if (v) url += `&${k}=${encodeURIComponent(v)}`; });
      const resp = await fetch(url, { signal: mkSignal(15000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const items = Array.isArray(data) ? data : data?.items ?? data?.results ?? data?.channels ?? data?.events ?? [data];
      setWResults(items);
    } catch (e: any) {
      setWError(e.message ?? "Erro ao buscar");
    } finally {
      setWLoading(false);
    }
  };

  const openWPlayer = (url: string, title: string) => {
    setWPlayerUrl(url);
    setWPlayerTitle(title);
    setWPlayerVisible(true);
  };

  const buildWarezEmbed = () => {
    const id = wEmbedId.trim();
    if (!id) return "";
    if (wEmbedType === "filme") return `${WAREZ_BASE}/filme/${id}`;
    return `${WAREZ_BASE}/serie/${id}/${wEmbedSeason}/${wEmbedEpisode}`;
  };

  const [driveStatus, setDriveStatus] = useState<{ online: boolean; latencyMs: number; folderCount: number } | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveFolders, setDriveFolders] = useState<{ label: string; count: number; drive: 0|1; path: string }[]>([]);
  const [driveTestQuery, setDriveTestQuery] = useState("");
  const [driveTestResults, setDriveTestResults] = useState<DriveMatch[]>([]);
  const [driveTestLoading, setDriveTestLoading] = useState(false);

  const [contentRequests, setContentRequests] = useState<ContentRequest[]>([]);
  const [contentReports, setContentReports] = useState<ContentReport[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [addingContent, setAddingContent] = useState<string | null>(null);
  const [resolvingReport, setResolvingReport] = useState<string | null>(null);

  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<{ sent: number; failed: number } | null>(null);

  const [massTitle, setMassTitle] = useState("🎬 NETPLAY");
  const [massBody, setMassBody] = useState("");
  const [massImage, setMassImage] = useState("");
  const [targetGroup, setTargetGroup] = useState<"all" | "active" | "guest">("all");
  const [sendingMass, setSendingMass] = useState(false);
  const [lastMassResult, setLastMassResult] = useState<{ sent: number; failed: number } | null>(null);

  interface PushLogEntry { id: string; sentAt: string; title: string; body: string; source: string; sent: number; failed: number; total: number; }
  const [pushLog, setPushLog] = useState<PushLogEntry[]>([]);
  const [pushLogLoading, setPushLogLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const [all, reports] = await Promise.all([
        db.contentRequests.getAll(),
        db.contentReports.getAll(),
      ]);
      setContentRequests(all);
      setContentReports(reports);
      const pendingReqs = all.filter((r) => r.status === "pending").length;
      const pendingReps = reports.filter((r) => r.status === "pending").length;
      setPendingCount(pendingReqs + pendingReps);
    } catch {}
  }, []);

  const loadTokenCount = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const tokens = await db.pushTokens.getAll();
      setTokenCount(tokens.length);
    } catch {}
  }, []);

  const loadPushLog = useCallback(async () => {
    const base = getApiBase();
    if (!base) return;
    setPushLogLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${base}/push/log`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        setPushLog(json.entries ?? []);
      }
    } catch {}
    finally { setPushLogLoading(false); }
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
    if (activeTab === "notifs") { loadTokenCount(); loadPushLog(); }
    if (activeTab === "logs") {
      setLogsLoading(true);
      fetch(`${getApiBase()}/app-logs?limit=300`, { signal: mkSignal(10000) })
        .then((r) => r.json())
        .then((d) => { if (d.logs) setLogsData(d.logs); })
        .catch(() => {})
        .finally(() => setLogsLoading(false));
    }
  }, [activeTab, loadRequests, loadTokenCount, loadPushLog]);

  const handleMarkAsResolved = async (reportId: string) => {
    setResolvingReport(reportId);
    try {
      await db.contentReports.markResolved(reportId);
      setContentReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: "resolved" } : r));
      setPendingCount((prev) => Math.max(0, prev - 1));
    } catch {}
    finally { setResolvingReport(null); }
  };

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
      const base = getApiBase();
      const res = await fetch(`${base}/tmdb/trending`, { signal: mkSignal(8000) });
      const ok = res.ok;
      setApis((prev) => prev.map((a) => a.name === "TMDB API" ? { ...a, status: ok ? "ok" : "error", latency: Date.now() - t0, detail: ok ? undefined : `HTTP ${res.status}` } : a));
    } catch (e: any) {
      setApis((prev) => prev.map((a) => (a.name === "TMDB API" ? { ...a, status: "error", detail: e?.message } : a)));
    }

    const t1 = Date.now();
    try {
      const res = await fetch("https://redeflixapi.store/filme/550", { method: "HEAD", signal: mkSignal(5000) });
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

  const fetchServerIp = useCallback(async () => {
    setServerIpLoading(true);
    try {
      const base = getApiBase();
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${base}/server-info`, { signal: ctrl.signal });
      if (r.ok) {
        const d = await r.json();
        setServerIp(d.ip ?? null);
      }
    } catch { setServerIp(null); }
    finally { setServerIpLoading(false); }
  }, []);

  useEffect(() => { fetchServerIp(); }, [fetchServerIp]);

  const loadDriveInfo = useCallback(async () => {
    setDriveLoading(true);
    const status = await checkDriveApi();
    setDriveStatus(status);
    if (status.online) {
      const roots = [
        { label: "Drive 0 / Animes",   drive: 0 as const, path: "Animes" },
        { label: "Drive 0 / Desenhos", drive: 0 as const, path: "Desenhos" },
        { label: "Drive 0 / Filmes",   drive: 0 as const, path: "Filmes" },
        { label: "Drive 0 / Novelas",  drive: 0 as const, path: "Novelas" },
        { label: "Drive 0 / Outros",   drive: 0 as const, path: "Outros" },
        { label: "Drive 1 / Filmes",   drive: 1 as const, path: "Filmes" },
        { label: "Drive 1 / Séries",   drive: 1 as const, path: "Séries" },
        { label: "Drive 1 / Livros",   drive: 1 as const, path: "Livros" },
      ];
      const results = await Promise.all(
        roots.map(async (r) => {
          const items = await listFolderAll(r.drive, r.path);
          return { label: r.label, count: items.length, drive: r.drive, path: r.path };
        })
      );
      setDriveFolders(results);
    }
    setDriveLoading(false);
  }, []);

  const handleDriveTest = useCallback(async () => {
    if (!driveTestQuery.trim()) return;
    setDriveTestLoading(true);
    const results = await searchDriveByTitle(driveTestQuery);
    setDriveTestResults(results);
    setDriveTestLoading(false);
  }, [driveTestQuery]);

  useEffect(() => {
    if (activeTab === "acervo" && !driveStatus) loadDriveInfo();
  }, [activeTab, driveStatus, loadDriveInfo]);

  if (authLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color="#e50914" size="large" />
      </View>
    );
  }

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
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
          {(["sistema", "notifs", "indicacoes", "emails", "acervo", "gstream", "warez", "terabox", "contas", "firebase", "logs"] as const).map((tab) => {
            const tabColor = tab === "gstream" ? "#6366f1" : tab === "warez" ? "#f97316" : tab === "terabox" ? "#06b6d4" : tab === "contas" ? "#22c55e" : tab === "firebase" ? "#ff6d00" : tab === "logs" ? "#e879f9" : RED;
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => {
                  setActiveTab(tab);
                  if (tab === "contas" && contasData.length === 0) {
                    setContasLoading(true);
                    db.subscriptions.getAllWithUsers().then((res) => { setContasData(res); setContasLoading(false); }).catch(() => setContasLoading(false));
                  }
                  if (tab === "firebase") {
                    setFcmStatsLoading(true);
                    fetch(`${getApiBase()}/push/stats`, { signal: mkSignal(8000) })
                      .then((r) => r.ok ? r.json() : null)
                      .then((d) => { if (d) setFcmStats(d); })
                      .catch(() => {})
                      .finally(() => setFcmStatsLoading(false));
                  }
                  if (tab === "logs") {
                    setLogsLoading(true);
                    setLogsData([]);
                    fetch(`${getApiBase()}/app-logs?limit=300`, { signal: mkSignal(10000) })
                      .then((r) => r.json())
                      .then((d) => { if (d.logs) setLogsData(d.logs); })
                      .catch(() => {})
                      .finally(() => setLogsLoading(false));
                  }
                }}
                style={[styles.tab, isActive && { borderBottomColor: tabColor, borderBottomWidth: 2 }]}
              >
                <Feather
                  name={tab === "sistema" ? "activity" : tab === "notifs" ? "send" : tab === "indicacoes" ? "inbox" : tab === "acervo" ? "hard-drive" : tab === "gstream" ? "play-circle" : tab === "warez" ? "globe" : tab === "terabox" ? "box" : tab === "contas" ? "users" : tab === "firebase" ? "zap" : tab === "logs" ? "terminal" : "mail"}
                  size={14}
                  color={isActive ? tabColor : colors.mutedForeground}
                />
                <Text style={[styles.tabTxt, { color: isActive ? tabColor : colors.mutedForeground }]}>
                  {tab === "sistema" ? "Sistema" : tab === "notifs" ? "Push" : tab === "indicacoes" ? "Pedidos" : tab === "acervo" ? "Acervo" : tab === "gstream" ? "GStream" : tab === "warez" ? "WarezCDN" : tab === "terabox" ? "Terabox" : tab === "contas" ? "Contas" : tab === "firebase" ? "Firebase" : tab === "logs" ? "Logs" : "E-mails"}
                </Text>
                {tab === "indicacoes" && pendingCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: RED }]}>
                    <Text style={styles.badgeTxt}>{pendingCount}</Text>
                  </View>
                )}
                {tab === "logs" && logsData.filter((l) => l.level === "error").length > 0 && (
                  <View style={[styles.badge, { backgroundColor: "#ef4444" }]}>
                    <Text style={styles.badgeTxt}>{logsData.filter((l) => l.level === "error").length}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

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

            {/* ── Servidor API ── */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 8 }]}>SERVIDOR API</Text>
            <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 8 }]}>
              <Text style={[{ fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }]}>
                Domínio atual: <Text style={{ color: colors.foreground, fontWeight: "600" }}>{getApiDomainDisplay()}</Text>
              </Text>
              <Text style={[{ fontSize: 11, color: colors.mutedForeground, marginBottom: 10, lineHeight: 16 }]}>
                Configure uma vez — salva no Supabase e <Text style={{ color: "#4caf50", fontWeight: "700" }}>todos os usuários recebem automaticamente</Text> na próxima abertura do app. Sem rebuild, sem variáveis de ambiente.
              </Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput
                  value={serverDomainInput}
                  onChangeText={(t) => { setServerDomainInput(t); setServerSaved(false); }}
                  placeholder="ex: meu-replit.replit.dev"
                  placeholderTextColor={colors.border}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={[{
                    flex: 1, borderWidth: 1, borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
                  }, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                />
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: serverSaved ? "#4caf50" : RED,
                    opacity: serverSaving ? 0.7 : 1,
                    minWidth: 72, alignItems: "center",
                  }}
                  disabled={serverSaving}
                  onPress={async () => {
                    setServerSaving(true);
                    try {
                      await setApiDomain(serverDomainInput);
                      setServerSaved(true);
                      Alert.alert(
                        "✅ Servidor salvo!",
                        `Domínio "${serverDomainInput.trim()}" configurado. Feche e reabra o app para aplicar em todas as telas.`
                      );
                    } catch {
                      Alert.alert("Erro", "Não foi possível salvar o domínio.");
                    } finally { setServerSaving(false); }
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                    {serverSaving ? "..." : serverSaved ? "Salvo" : "Salvar"}
                  </Text>
                </TouchableOpacity>
              </View>
              {serverDomainInput.trim() !== "" && (
                <TouchableOpacity
                  style={{ marginTop: 10, alignSelf: "flex-start" }}
                  onPress={async () => {
                    setServerSaving(true);
                    try {
                      const base = `https://${serverDomainInput.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")}/api`;
                      const ctrl = new AbortController();
                      setTimeout(() => ctrl.abort(), 5000);
                      const res = await fetch(`${base}/healthz`, { signal: ctrl.signal });
                      if (res.ok) {
                        Alert.alert("✅ Servidor online!", `${base} respondeu com status ${res.status}.`);
                      } else {
                        Alert.alert("⚠️ Aviso", `Servidor respondeu com status ${res.status}.`);
                      }
                    } catch (e: any) {
                      Alert.alert("❌ Inacessível", `Não foi possível alcançar o servidor.\n${e?.message ?? ""}`);
                    } finally { setServerSaving(false); }
                  }}
                >
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, textDecorationLine: "underline" }}>
                    Testar conexão
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Testador de Players ── */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16, marginBottom: 8 }]}>DIAGNÓSTICO DE PLAYERS</Text>
            <Pressable
              onPress={() => router.push("/link-tester" as any)}
              style={[styles.apiCard, { backgroundColor: "#f9731618", borderColor: "#f9731640", flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, marginBottom: 16 }]}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#f97316", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 22 }}>🧪</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.apiName, { color: colors.foreground, fontSize: 15 }]}>Testador de Links</Text>
                <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>220 estratégias de player — nixplay.lat, CF Worker, fontedecanais e mais</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#f97316" />
            </Pressable>

            <View style={[styles.infoBox, { backgroundColor: "#6366f110", borderColor: "#6366f130", marginBottom: 8 }]}>
              <Feather name="info" size={15} color="#6366f1" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: "#6366f1" }]}>Como funciona</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground, lineHeight: 17 }]}>
                  {`• Admin salva o domínio aqui → vai pro Supabase\n• Todos os usuários buscam do Supabase ao abrir o app\n• Se mudar de conta Replit, atualiza uma vez aqui e todos recebem\n• Funciona sem rebuild do APK`}
                </Text>
              </View>
            </View>
            <View style={[styles.infoBox, { backgroundColor: "#f5a62310", borderColor: "#f5a62330", marginBottom: 16 }]}>
              <Feather name="alert-triangle" size={15} color="#f5a623" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: "#f5a623" }]}>Pré-requisito: tabela no Supabase</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground, lineHeight: 17 }]}>
                  {`Execute este SQL no Supabase → SQL Editor:`}
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 8, backgroundColor: colors.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border }}
                  onPress={() => {
                    const sql = `CREATE TABLE IF NOT EXISTS public.app_config (\n  key   TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n);\nALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "anon read" ON public.app_config FOR SELECT USING (true);\nCREATE POLICY "service write" ON public.app_config FOR INSERT WITH CHECK (true);\nCREATE POLICY "service update" ON public.app_config FOR UPDATE USING (true);`;
                    Clipboard.setString(sql);
                    Alert.alert("✅ Copiado!", "Cole no SQL Editor do Supabase e execute.");
                  }}
                >
                  <Text style={{ fontFamily: "monospace", fontSize: 10, color: colors.mutedForeground, lineHeight: 15 }}>
                    {"CREATE TABLE IF NOT EXISTS public.app_config (\n  key   TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n);\n-- + políticas RLS (toque para copiar tudo)"}
                  </Text>
                  <Text style={{ color: "#f5a623", fontSize: 11, marginTop: 6, fontWeight: "600" }}>📋 Toque para copiar SQL completo</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── IP do Proxy CDN ── */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 4 }]}>PROXY CDN — IP DO SERVIDOR</Text>
            <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 8 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
                <Feather name="server" size={16} color="#3b82f6" />
                <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "700" }}>IP Público do Servidor Replit</Text>
                <TouchableOpacity
                  onPress={fetchServerIp}
                  disabled={serverIpLoading}
                  style={{ marginLeft: "auto" as any, padding: 4 }}
                >
                  <Feather name="refresh-cw" size={14} color={serverIpLoading ? colors.border : RED} />
                </TouchableOpacity>
              </View>

              {serverIpLoading ? (
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Buscando IP...</Text>
              ) : serverIp ? (
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(serverIp);
                    Alert.alert("✅ Copiado!", `IP "${serverIp}" copiado para a área de transferência.`);
                  }}
                  style={{ backgroundColor: "#3b82f615", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#3b82f630", marginBottom: 10 }}
                >
                  <Text style={{ fontFamily: "monospace", fontSize: 16, color: "#3b82f6", fontWeight: "700", textAlign: "center" }}>
                    {serverIp}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>
                    📋 Toque para copiar
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 12, color: "#ef4444", marginBottom: 10 }}>⚠️ Não foi possível obter o IP. Verifique a conexão com o servidor.</Text>
              )}

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>O que fazer com este IP:</Text>
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
                  {"1. Acesse o painel do seu provedor IPTV (Xtream Codes / Panel)\n2. Vá em Configurações → IPs Permitidos / Whitelist\n3. Adicione o IP acima para que os tokens de streaming funcionem\n4. Salve e teste o player"}
                </Text>
                <View style={{ marginTop: 6, backgroundColor: "#f5a62310", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#f5a62330" }}>
                  <Text style={{ fontSize: 11, color: "#f5a623", lineHeight: 16 }}>
                    ⚠️ O IP pode mudar quando o servidor Replit reiniciar. Se os vídeos pararem de funcionar, reabra esta tela, copie o novo IP e atualize no painel IPTV.
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.infoBox, { backgroundColor: "#10b98110", borderColor: "#10b98130", marginBottom: 16 }]}>
              <Feather name="info" size={15} color="#10b981" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: "#10b981" }]}>Como o proxy funciona</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground, lineHeight: 17 }]}>
                  {`• Vídeos fontedecanais usam tokens IP-bound\n• O servidor proxy (Replit) busca o stream com seu IP\n• O APK reproduz através do servidor — sem bloqueio\n• O IP acima é o que o provedor IPTV vê nas requisições`}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── ABA PUSH ── */}
        {activeTab === "notifs" && (
          <>
            {/* ── HISTÓRICO DE ENVIOS ── */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 10 }}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HISTÓRICO DE ENVIOS</Text>
              <TouchableOpacity onPress={loadPushLog} style={[styles.refreshBtn, { backgroundColor: colors.cardElevated ?? colors.border }]}>
                <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
                <Text style={[styles.refreshText, { color: colors.mutedForeground }]}>Atualizar</Text>
              </TouchableOpacity>
            </View>

            {pushLogLoading ? (
              <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 20 }]}>
                <ActivityIndicator color={RED} />
                <Text style={[{ fontSize: 12, marginTop: 8 }, { color: colors.mutedForeground }]}>Carregando histórico...</Text>
              </View>
            ) : pushLog.length === 0 ? (
              <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 20 }]}>
                <Feather name="inbox" size={28} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                <Text style={[{ fontSize: 13, fontWeight: "600" }, { color: colors.mutedForeground }]}>Nenhum envio registrado</Text>
                <Text style={[{ fontSize: 11, marginTop: 4, textAlign: "center" }, { color: colors.mutedForeground }]}>
                  O histórico é mantido em memória pelo servidor. Reaparecem após o próximo envio.
                </Text>
              </View>
            ) : (
              <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: "hidden", marginBottom: 20 }]}>
                {pushLog.slice(0, 20).map((entry, i) => {
                  const sentAt = new Date(entry.sentAt);
                  const now = Date.now();
                  const diffMs = now - sentAt.getTime();
                  const diffMin = Math.floor(diffMs / 60000);
                  const diffH = Math.floor(diffMin / 60);
                  const timeAgo = diffMin < 1 ? "agora" : diffMin < 60 ? `${diffMin}min atrás` : diffH < 24 ? `${diffH}h atrás` : sentAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  const hasFail = entry.failed > 0;
                  const allFail = entry.sent === 0 && entry.failed > 0;
                  const sourceColors: Record<string, string> = { auto: "#3b82f6", admin: "#8b5cf6", r2: "#10b981", terabox: "#f59e0b" };
                  const srcColor = sourceColors[entry.source] ?? "#6b7280";
                  return (
                    <View key={entry.id} style={[{ padding: 14 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: allFail ? "#e5091415" : "#4caf5015", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Feather name={allFail ? "x-circle" : "check-circle"} size={18} color={allFail ? RED : "#4caf50"} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                            <Text style={[{ fontSize: 13, fontWeight: "700", flexShrink: 1 }, { color: colors.foreground }]} numberOfLines={1}>{entry.title}</Text>
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: `${srcColor}20`, borderWidth: 1, borderColor: `${srcColor}40` }}>
                              <Text style={{ fontSize: 9, fontWeight: "700", color: srcColor, letterSpacing: 0.5 }}>{entry.source.toUpperCase()}</Text>
                            </View>
                          </View>
                          <Text style={[{ fontSize: 11, marginBottom: 8 }, { color: colors.mutedForeground }]} numberOfLines={2}>{entry.body}</Text>
                          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Feather name="check" size={11} color="#4caf50" />
                              <Text style={{ fontSize: 11, fontWeight: "700", color: "#4caf50" }}>{entry.sent}</Text>
                              <Text style={[{ fontSize: 11 }, { color: colors.mutedForeground }]}>enviados</Text>
                            </View>
                            {hasFail && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Feather name="x" size={11} color={RED} />
                                <Text style={{ fontSize: 11, fontWeight: "700", color: RED }}>{entry.failed}</Text>
                                <Text style={[{ fontSize: 11 }, { color: colors.mutedForeground }]}>falharam</Text>
                              </View>
                            )}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Feather name="smartphone" size={11} color={colors.mutedForeground} />
                              <Text style={[{ fontSize: 11 }, { color: colors.mutedForeground }]}>{entry.total} total</Text>
                            </View>
                            <Text style={[{ fontSize: 11, marginLeft: "auto" as any }, { color: colors.mutedForeground }]}>{timeAgo}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
                {pushLog.length > 20 && (
                  <View style={[{ padding: 12, alignItems: "center" }, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[{ fontSize: 12 }, { color: colors.mutedForeground }]}>+ {pushLog.length - 20} entradas mais antigas</Text>
                  </View>
                )}
              </View>
            )}

            {/* Contagem de tokens */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TOKENS REGISTRADOS</Text>

            {/* Card principal: tokens vs total de usuários */}
            <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${RED}18`, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="smartphone" size={18} color={RED} />
                  </View>
                  <View>
                    <Text style={[{ fontSize: 22, fontWeight: "800" }, { color: colors.foreground }]}>
                      {tokenCount ?? "..."}{" "}
                      <Text style={[{ fontSize: 14, fontWeight: "400" }, { color: colors.mutedForeground }]}>
                        de {userCount ?? "..."} usuários
                      </Text>
                    </Text>
                    <Text style={[{ fontSize: 12, marginTop: 2 }, { color: colors.mutedForeground }]}>
                      {tokenCount !== null && userCount !== null
                        ? tokenCount === userCount
                          ? "✅ Todos os usuários com push ativo"
                          : `⚠️ ${userCount - tokenCount} usuário${userCount - tokenCount !== 1 ? "s" : ""} ainda não abriram o app atualizado`
                        : "Carregando..."}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={loadTokenCount}
                  style={[styles.refreshBtn, { backgroundColor: colors.cardElevated ?? colors.border }]}
                >
                  <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.refreshText, { color: colors.mutedForeground }]}>Atualizar</Text>
                </TouchableOpacity>
              </View>

              {/* Barra de progresso */}
              {tokenCount !== null && userCount !== null && userCount > 0 && (
                <View style={{ gap: 6 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.min(100, (tokenCount / userCount) * 100)}%`, backgroundColor: tokenCount === userCount ? "#4caf50" : RED, borderRadius: 3 }} />
                  </View>
                  <Text style={[{ fontSize: 11 }, { color: colors.mutedForeground }]}>
                    {Math.round((tokenCount / userCount) * 100)}% de cobertura push
                  </Text>
                </View>
              )}
            </View>

            {/* Aviso explicativo se tokens < usuários */}
            {tokenCount !== null && userCount !== null && tokenCount < userCount && (
              <View style={[{ borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: "row", gap: 10, alignItems: "flex-start" }, { backgroundColor: "#f59e0b15", borderWidth: 1, borderColor: "#f59e0b40" }]}>
                <Feather name="info" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 13, fontWeight: "700", marginBottom: 4 }, { color: "#f59e0b" }]}>
                    Por que faltam dispositivos?
                  </Text>
                  <Text style={[{ fontSize: 12, lineHeight: 18 }, { color: colors.mutedForeground }]}>
                    O token push é registrado automaticamente quando o usuário <Text style={{ fontWeight: "700", color: colors.foreground }}>abre o app</Text>. Os {userCount - tokenCount} usuários restantes precisam abrir o app atualizado ao menos uma vez para aparecerem aqui.
                  </Text>
                </View>
              </View>
            )}

            {tokenCount !== null && tokenCount === 0 && (
              <View style={[{ borderRadius: 12, padding: 14, marginBottom: 20 }, { backgroundColor: "#e5091415", borderWidth: 1, borderColor: "#e5091440" }]}>
                <Text style={[{ fontSize: 13, fontWeight: "700", marginBottom: 4 }, { color: RED }]}>Tabela push_tokens vazia</Text>
                <Text style={[{ fontSize: 12, lineHeight: 18 }, { color: colors.mutedForeground }]}>
                  Execute o SQL da aba Sistema no Supabase e peça aos usuários para abrirem o app.
                </Text>
              </View>
            )}

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

        {/* ── ABA FIREBASE ── */}
        {activeTab === "firebase" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>PROJETO FIREBASE</Text>
            <View style={[styles.statsRow, { marginBottom: 16 }]}>
              <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#ff6d0020", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>🔥</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.statsValue, { color: colors.foreground, fontSize: 13 }]}>grupo-streaming-brasil-aa209</Text>
                    <Text style={[styles.statsLabel, { color: colors.mutedForeground }]}>Firebase Project ID</Text>
                  </View>
                  <View style={[badge.wrap, { backgroundColor: "#4caf5022", borderColor: "#4caf5055" }]}>
                    <View style={[badge.dot, { backgroundColor: "#4caf50" }]} />
                    <Text style={[badge.text, { color: "#4caf50" }]}>Ativo</Text>
                  </View>
                </View>
                {[
                  { label: "Package Name", value: "com.netplay.app" },
                  { label: "google-services.json", value: "✅ Configurado" },
                  { label: "FCM V1 Service Account", value: fcmStats?.fcmV1Active ? "✅ Configurado" : "⚠️ Não configurado" },
                ].map((item, i) => (
                  <View key={i} style={[{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[{ fontSize: 12 }, { color: colors.mutedForeground }]}>{item.label}</Text>
                    <Text style={[{ fontSize: 12, fontWeight: "600" }, { color: colors.foreground }]} numberOfLines={1}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.infoBox, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b40", marginBottom: 16 }]}>
              <Feather name="alert-triangle" size={15} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: fcmStats?.fcmV1Active ? "#4caf50" : "#f59e0b" }]}>{fcmStats?.fcmV1Active ? "✅ FCM V1 configurado" : "⚙️ Configure o FCM V1 para o APK funcionar"}</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground, lineHeight: 18 }]}>
                  {fcmStats?.fcmV1Active
                    ? `O servidor envia via FCM V1 direto usando o Service Account. Tokens FCM nativos do APK (Codemagic) funcionam sem depender do expo.dev.`
                    : `O APK do Codemagic usa tokens FCM nativos. Para o servidor enviar, adicione o secret:\n\n1. Firebase Console → grupo-streaming-brasil-aa209\n   → ⚙️ Configurações → Contas de serviço\n   → "Gerar nova chave privada" → baixe .json\n\n2. No Replit → Secrets → adicione:\n   Nome: FIREBASE_SERVICE_ACCOUNT_JSON\n   Valor: conteúdo completo do arquivo .json\n\n3. Reinicie o servidor (já feito automaticamente)`}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>TOKENS REGISTRADOS</Text>
            <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
              {fcmStats ? (
                <>
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                    {[
                      { label: "Total", value: fcmStats.total, color: RED },
                      { label: "Expo", value: fcmStats.expo, color: "#6366f1" },
                      { label: "Nativos FCM", value: fcmStats.native, color: "#f59e0b" },
                    ].map((s, i) => (
                      <View key={i} style={{ flex: 1, backgroundColor: `${s.color}18`, borderRadius: 10, padding: 10, alignItems: "center" }}>
                        <Text style={[styles.statsValue, { color: s.color, fontSize: 24 }]}>{s.value}</Text>
                        <Text style={[styles.statsLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={[{ fontSize: 11, lineHeight: 16 }, { color: colors.mutedForeground }]}>
                    Tokens Expo são enviados via serviço Expo → FCM automaticamente. Tokens FCM nativos exigem Firebase Admin SDK para envio direto (premium).
                  </Text>
                </>
              ) : (
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  {fcmStatsLoading
                    ? <ActivityIndicator size="small" color={RED} />
                    : <Feather name="wifi-off" size={16} color={colors.mutedForeground} />}
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                    {fcmStatsLoading ? "Carregando..." : "Sem dados — servidor pode estar offline"}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={{ flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-end", marginTop: 10, padding: 6 }}
                onPress={() => {
                  setFcmStatsLoading(true);
                  fetch(`${getApiBase()}/push/stats`, { signal: mkSignal(8000) })
                    .then((r) => r.ok ? r.json() : null)
                    .then((d) => { if (d) setFcmStats(d); })
                    .catch(() => {})
                    .finally(() => setFcmStatsLoading(false));
                }}
              >
                <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Atualizar</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>TESTAR NOTIFICAÇÃO FCM</Text>
            <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
              <TextInput
                value={fcmTestTitle}
                onChangeText={setFcmTestTitle}
                placeholder="Título"
                placeholderTextColor={colors.border}
                style={[{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 }, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              />
              <TextInput
                value={fcmTestBody}
                onChangeText={setFcmTestBody}
                placeholder="Mensagem de teste..."
                placeholderTextColor={colors.border}
                multiline
                numberOfLines={2}
                style={[{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10, textAlignVertical: "top" }, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              />
              <TextInput
                value={fcmTestImage}
                onChangeText={setFcmTestImage}
                placeholder="URL da imagem (opcional)"
                placeholderTextColor={colors.border}
                style={[{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 12 }, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              />
              {fcmTestResult && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", gap: 12, backgroundColor: fcmTestResult.sent > 0 ? "#4caf5015" : "#e5091415", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: fcmTestResult.sent > 0 ? "#4caf5040" : "#e5091440" }}>
                    {[{ l: "Enviados", v: fcmTestResult.sent, c: "#4caf50" }, { l: "Falharam", v: fcmTestResult.failed, c: fcmTestResult.failed > 0 ? RED : colors.mutedForeground }, { l: "Total", v: fcmTestResult.total, c: colors.foreground }].map((s, i) => (
                      <View key={i} style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 22, fontWeight: "800", color: s.c }}>{s.v}</Text>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{s.l}</Text>
                      </View>
                    ))}
                  </View>
                  {fcmTestResult.errors && fcmTestResult.errors.length > 0 && (
                    <View style={{ marginTop: 8, backgroundColor: "#1a0a0a", borderRadius: 10, borderWidth: 1, borderColor: "#e5091430", padding: 10, gap: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: RED, marginBottom: 2 }}>ERROS DETALHADOS</Text>
                      {fcmTestResult.errors.map((e, i) => (
                        <View key={i} style={{ backgroundColor: "#e5091410", borderRadius: 6, padding: 8 }}>
                          <Text style={{ fontSize: 10, color: "#ff6b6b", fontWeight: "700" }}>{e.error}</Text>
                          <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "monospace" }} numberOfLines={2}>{e.token}</Text>
                          {e.message ? <Text style={{ fontSize: 10, color: "#aaa", marginTop: 2 }} numberOfLines={3}>{e.message}</Text> : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
              <TouchableOpacity
                style={{ borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: fcmTesting ? colors.border : "#ff6d00", opacity: fcmTesting ? 0.7 : 1 }}
                onPress={async () => {
                  if (!fcmTestBody.trim()) { Alert.alert("Informe a mensagem"); return; }
                  setFcmTesting(true);
                  setFcmTestResult(null);
                  try {
                    const r = await sendPushViaServer(
                      fcmTestTitle || "🔔 NETPLAY FCM",
                      fcmTestBody,
                      { type: "mass_push" },
                      fcmTestImage || undefined,
                    );
                    setFcmTestResult({ ...r, errors: [] });
                    Alert.alert(r.sent > 0 ? "✅ FCM OK!" : "⚠️ Aviso", `Enviados: ${r.sent}\nFalharam: ${r.failed}\nTotal: ${r.total}`);
                  } catch (e: any) {
                    Alert.alert("Erro FCM", e?.message ?? "Falha no envio");
                  } finally { setFcmTesting(false); }
                }}
                disabled={fcmTesting}
              >
                <Text style={{ fontSize: 18 }}>🔥</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
                  {fcmTesting ? "Enviando..." : "Enviar teste FCM para todos"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>NOTIFICAÇÕES AUTOMÁTICAS</Text>
            <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: "hidden", marginBottom: 16 }]}>
              {[
                { e: "📺", t: "Novos episódios", s: "Novo ep. estreia → poster + deep link para aba EPISÓDIOS", c: "#6366f1" },
                { e: "🔥", t: "Novo conteúdo", s: "Novos filmes/séries chegam ao catálogo (verifica a cada 1h)", c: RED },
                { e: "⏸", t: "Inatividade", s: "15 min sem atividade → lembra do conteúdo assistido por último", c: "#f59e0b" },
                { e: "📅", t: "Plano expirando", s: "3 dias antes de expirar — convite para renovar", c: "#3b82f6" },
                { e: "⭐", t: "Upgrade de convidado", s: "2 dias após cadastro como guest", c: "#8b5cf6" },
                { e: "📊", t: "Resumo semanal", s: "Sábados às 19h — destaques da semana", c: "#10b981" },
              ].map((item, i) => (
                <View key={i} style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: `${item.c}20`, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 16 }}>{item.e}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{item.t}</Text>
                    <Text style={{ fontSize: 11, marginTop: 2, color: colors.mutedForeground }}>{item.s}</Text>
                  </View>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4caf50" }} />
                </View>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>SETUP — TABELA NOVOS EPISÓDIOS</Text>
            <View style={[styles.infoBox, { backgroundColor: "#6366f110", borderColor: "#6366f130", marginBottom: 24 }]}>
              <Feather name="database" size={16} color="#6366f1" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: "#6366f1" }]}>new_episodes no Supabase</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  Execute este SQL para ativar detecção automática de novos episódios com notificação push + banner:
                </Text>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}
                  onPress={() => {
                    const sql = `CREATE TABLE IF NOT EXISTS new_episodes (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  tmdb_id INTEGER NOT NULL,\n  season INTEGER NOT NULL,\n  episode INTEGER NOT NULL,\n  episode_title TEXT,\n  air_date TEXT,\n  poster_path TEXT,\n  notified_at TIMESTAMPTZ DEFAULT NOW(),\n  expires_at TIMESTAMPTZ NOT NULL,\n  UNIQUE(tmdb_id, season, episode)\n);\nALTER TABLE new_episodes ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "public_new_episodes" ON new_episodes;\nCREATE POLICY "public_new_episodes"\n  ON new_episodes FOR ALL\n  USING (true) WITH CHECK (true);`;
                    if (Platform.OS === "web") {
                      navigator.clipboard?.writeText(sql).catch(() => {});
                    } else {
                      Clipboard.setString(sql);
                    }
                    Alert.alert("SQL copiado!", "Cole no Supabase → SQL Editor → Run.");
                  }}
                >
                  <Feather name="copy" size={13} color="#6366f1" />
                  <Text style={[styles.copyBtnTxt, { color: "#6366f1" }]}>Copiar SQL</Text>
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

            {/* ── CONTEÚDOS REPORTADOS ── */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
                CONTEÚDOS REPORTADOS
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {contentReports.filter((r) => r.status === "pending").length > 0 && (
                  <View style={{ backgroundColor: "#f97316", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{contentReports.filter((r) => r.status === "pending").length}</Text>
                  </View>
                )}
                <Pressable onPress={loadRequests} style={[styles.refreshBtn, { backgroundColor: colors.card }]}>
                  <Feather name="refresh-cw" size={14} color="#f97316" />
                  <Text style={[styles.refreshText, { color: "#f97316" }]}>Atualizar</Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.infoBox, { backgroundColor: "#f9731610", borderColor: "#f9731630", marginBottom: 12 }]}>
              <Feather name="alert-triangle" size={15} color="#fb923c" />
              <Text style={[styles.infoBoxText, { color: colors.mutedForeground, flex: 1 }]}>
                Quando um usuário clica em "Conteúdo Errado" na sinopse, o reporte aparece aqui para você corrigir.
              </Text>
            </View>

            {contentReports.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="check-circle" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
                  Nenhum reporte pendente
                </Text>
              </View>
            ) : (
              contentReports.map((report) => {
                const isPending = report.status === "pending";
                const isResolving = resolvingReport === report.id;
                const posterUri = report.poster_path ? TMDB_IMG(report.poster_path, "w500") : null;
                const reasonColors: Record<string, string> = {
                  wrong_content: "#f97316",
                  not_working: "#ef4444",
                  wrong_audio_sub: "#a78bfa",
                  other: "#6b7280",
                };
                const rColor = reasonColors[report.reason] ?? "#6b7280";
                return (
                  <View key={report.id ?? report.created_at} style={[styles.requestCard, { backgroundColor: colors.card, borderColor: isPending ? `${rColor}40` : "#4caf5040" }]}>
                    {posterUri ? (
                      <Image source={{ uri: posterUri }} style={styles.requestPoster} resizeMode="cover" />
                    ) : (
                      <View style={[styles.requestPoster, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
                        <Feather name="film" size={20} color={colors.mutedForeground} />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.requestTitle, { color: colors.foreground }]} numberOfLines={2}>{report.title}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <View style={[styles.typeBadge, { backgroundColor: `${rColor}20`, borderColor: `${rColor}40` }]}>
                          <Feather name="alert-triangle" size={10} color={rColor} />
                          <Text style={[styles.typeTxt, { color: rColor }]}>{report.reason_label}</Text>
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: report.type === "movie" ? "#3b82f620" : "#8b5cf620", borderColor: report.type === "movie" ? "#3b82f640" : "#8b5cf640" }]}>
                          <Text style={[styles.typeTxt, { color: report.type === "movie" ? "#3b82f6" : "#8b5cf6" }]}>{report.type === "movie" ? "Filme" : "Série"}</Text>
                        </View>
                      </View>
                      {report.created_at && (
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                          {new Date(report.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      )}
                      {isPending ? (
                        <TouchableOpacity
                          style={[styles.addBtn, { backgroundColor: isResolving ? colors.border : "#16a34a", opacity: isResolving ? 0.7 : 1, marginTop: 4 }]}
                          onPress={() => report.id && handleMarkAsResolved(report.id)}
                          disabled={isResolving}
                        >
                          <Feather name={isResolving ? "loader" : "check-circle"} size={13} color="#fff" />
                          <Text style={styles.addBtnTxt}>{isResolving ? "Resolvendo..." : "Marcar como resolvido"}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.addedBadge}>
                          <Feather name="check-circle" size={13} color="#4caf50" />
                          <Text style={[styles.addedTxt, { color: "#4caf50" }]}>Resolvido</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            <View style={[styles.infoBox, { backgroundColor: "#fbbf2410", borderColor: "#fbbf2430", marginTop: 16 }]}>
              <Feather name="database" size={16} color={GOLD} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: GOLD }]}>Setup Supabase para reports</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  Execute este SQL no Supabase para ativar os reports de conteúdo:
                </Text>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}
                  onPress={() => {
                    const sql = `CREATE TABLE IF NOT EXISTS content_reports (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  user_id UUID NOT NULL,\n  tmdb_id INTEGER NOT NULL,\n  type TEXT NOT NULL,\n  title TEXT NOT NULL,\n  poster_path TEXT,\n  reason TEXT NOT NULL,\n  reason_label TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending',\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "public_content_reports" ON content_reports;\nCREATE POLICY "public_content_reports"\n  ON content_reports FOR ALL\n  USING (true) WITH CHECK (true);`;
                    Clipboard.setString(sql);
                    Alert.alert("Copiado!", "Cole o SQL no Supabase → SQL Editor e clique em Run.");
                  }}
                >
                  <Feather name="copy" size={13} color={GOLD} />
                  <Text style={[styles.copyBtnTxt, { color: GOLD }]}>Copiar SQL de setup</Text>
                </TouchableOpacity>
              </View>
            </View>

          </>
        )}

        {/* ── ABA ACERVO ── */}
        {activeTab === "acervo" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>STATUS DO DRIVE INDEX</Text>

            <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 14 }]}>
              <View style={styles.apiRow}>
                <View style={styles.apiLeft}>
                  <Text style={[styles.apiName, { color: colors.foreground }]}>animezey23112022.workers.dev</Text>
                  {driveStatus?.latencyMs !== undefined && (
                    <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>{driveStatus.latencyMs}ms</Text>
                  )}
                  {driveStatus?.online && (
                    <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>
                      {driveStatus.folderCount} itens na raiz de Animes
                    </Text>
                  )}
                </View>
                {driveLoading ? (
                  <ActivityIndicator size="small" color={RED} />
                ) : (
                  <StatusBadge status={driveStatus?.online ? "ok" : driveStatus === null ? "loading" : "error"} />
                )}
              </View>
            </View>

            <Pressable
              onPress={loadDriveInfo}
              style={[styles.refreshBtn, { backgroundColor: colors.card, alignSelf: "flex-start", marginBottom: 20, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }]}
            >
              <Feather name="refresh-cw" size={14} color={RED} />
              <Text style={[styles.refreshText, { color: RED }]}>Atualizar</Text>
            </Pressable>

            {driveFolders.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>CONTEÚDO POR PASTA</Text>
                <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 20 }]}>
                  {driveFolders.map((folder, i) => (
                    <React.Fragment key={folder.label}>
                      <View style={styles.apiRow}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                          <Feather name="folder" size={14} color={RED} />
                          <Text style={[styles.apiName, { color: colors.foreground }]}>{folder.label}</Text>
                        </View>
                        <View style={[badge.wrap, { backgroundColor: RED + "20", borderColor: RED + "40" }]}>
                          <Text style={[badge.text, { color: RED }]}>{folder.count}</Text>
                        </View>
                      </View>
                      {i < driveFolders.length - 1 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}

            {driveLoading && driveFolders.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}>
                <ActivityIndicator color={RED} size="large" />
                <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>Carregando estatísticas...</Text>
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>TESTAR BUSCA POR TÍTULO</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[{
                  flex: 1, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                  color: colors.foreground, fontSize: 14,
                }]}
                placeholder="Ex: Dragon Ball, Naruto, One Piece..."
                placeholderTextColor={colors.mutedForeground}
                value={driveTestQuery}
                onChangeText={setDriveTestQuery}
                returnKeyType="search"
                onSubmitEditing={handleDriveTest}
              />
              <Pressable
                onPress={handleDriveTest}
                style={{ backgroundColor: RED, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}
              >
                {driveTestLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="search" size={16} color="#fff" />
                )}
              </Pressable>
            </View>

            {driveTestResults.length > 0 && (
              <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.apiLatency, { color: colors.mutedForeground, marginBottom: 8 }]}>
                  {driveTestResults.length} resultado(s) encontrado(s):
                </Text>
                {driveTestResults.map((r, i) => (
                  <React.Fragment key={i}>
                    <View style={[styles.apiRow, { paddingVertical: 6 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.apiName, { color: colors.foreground }]}>{r.name}</Text>
                        <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>
                          Drive {r.drive} · {r.category}{r.isFolder ? " · 📁 pasta" : " · 🎬 arquivo"}
                        </Text>
                      </View>
                      <View style={[badge.wrap, { backgroundColor: "#16a34a20", borderColor: "#16a34a40" }]}>
                        <Text style={[badge.text, { color: "#4ade80" }]}>
                          {r.isFolder ? "PASTA" : "ARQUIVO"}
                        </Text>
                      </View>
                    </View>
                    {i < driveTestResults.length - 1 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                  </React.Fragment>
                ))}
              </View>
            )}

            {/* ── R2 Cloudflare ── */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 24, marginBottom: 10 }]}>CLOUDFLARE R2 · ACERVO EXCLUSIVO</Text>
            <Pressable
              onPress={() => router.push("/r2-catalog")}
              style={[styles.apiCard, { backgroundColor: RED + "18", borderColor: RED + "40", flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 }]}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: RED, alignItems: "center", justifyContent: "center" }}>
                <Feather name="cloud" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.apiName, { color: colors.foreground, fontSize: 15 }]}>Catálogo R2</Text>
                <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>Filmes e séries armazenados no R2</Text>
              </View>
              <Feather name="chevron-right" size={18} color={RED} />
            </Pressable>

            {driveTestResults.length === 0 && driveTestQuery.length > 0 && !driveTestLoading && (
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <Text style={[styles.infoSub, { color: colors.mutedForeground }]}>
                  Nenhum conteúdo encontrado no Acervo para "{driveTestQuery}"
                </Text>
              </View>
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

        {/* ── ABA GSTREAM ── */}
        {activeTab === "gstream" && (
          <>
            {/* Header GStream */}
            <View style={[gs.header, { backgroundColor: "#6366f115", borderColor: "#6366f130" }]}>
              <View style={gs.headerIcon}>
                <Feather name="play-circle" size={22} color="#6366f1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[gs.headerTitle, { color: colors.foreground }]}>GStream</Text>
                <Text style={[gs.headerSub, { color: colors.mutedForeground }]}>Powered by embedplayer.site</Text>
              </View>
            </View>

            {/* Sub-nav */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 12 }}>
                {(["dashboard", "filmes", "series", "animes", "api"] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setGSection(s)}
                    style={[gs.subTab, {
                      backgroundColor: gSection === s ? "#6366f1" : colors.card,
                      borderColor: gSection === s ? "#6366f1" : colors.border,
                    }]}
                  >
                    <Feather
                      name={s === "dashboard" ? "grid" : s === "filmes" ? "film" : s === "series" ? "tv" : s === "animes" ? "zap" : "code"}
                      size={13}
                      color={gSection === s ? "#fff" : colors.mutedForeground}
                    />
                    <Text style={[gs.subTabTxt, { color: gSection === s ? "#fff" : colors.mutedForeground }]}>
                      {s === "dashboard" ? "Dashboard" : s === "filmes" ? "Filmes" : s === "series" ? "Séries" : s === "animes" ? "Animes" : "API"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* ── Dashboard ── */}
            {gSection === "dashboard" && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>STATUS DO EMBEDPLAYER</Text>
                <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
                  <View style={styles.apiRow}>
                    <View style={styles.apiLeft}>
                      <Text style={[styles.apiName, { color: colors.foreground }]}>embed.embedplayer.site</Text>
                      {gApiLatency !== null && (
                        <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>{gApiLatency}ms</Text>
                      )}
                      <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>
                        Endpoint de embed para filmes e séries via TMDB ID
                      </Text>
                    </View>
                    {gApiStatus === "loading" ? (
                      <ActivityIndicator size="small" color="#6366f1" />
                    ) : gApiStatus === "idle" ? (
                      <View style={[badge.wrap, { backgroundColor: "#33333322", borderColor: "#33333355" }]}>
                        <View style={[badge.dot, { backgroundColor: "#888" }]} />
                        <Text style={[badge.text, { color: "#888" }]}>Aguardando</Text>
                      </View>
                    ) : (
                      <StatusBadge status={gApiStatus === "ok" ? "ok" : "error"} />
                    )}
                  </View>
                </View>

                <Pressable
                  onPress={checkGStreamApi}
                  style={[styles.refreshBtn, { backgroundColor: "#6366f120", borderColor: "#6366f140", borderWidth: 1, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, marginBottom: 20 }]}
                >
                  {gApiStatus === "loading" ? (
                    <ActivityIndicator size="small" color="#6366f1" />
                  ) : (
                    <Feather name="zap" size={14} color="#6366f1" />
                  )}
                  <Text style={[styles.refreshText, { color: "#6366f1" }]}>Verificar API</Text>
                </Pressable>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>SUPORTE POR TIPO</Text>
                <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "film", label: "Filmes", desc: "✅ 11.433 filmes — usa IMDB ID (tt...), não TMDB ID", ok: true },
                    { icon: "tv", label: "Séries", desc: "✅ 2.949 séries — verifica DUB/LEG por TMDB ID + T/E", ok: true },
                    { icon: "zap", label: "Animes", desc: "✅ 244 animes — mesmo endpoint /tv/ das séries", ok: true },
                  ].map((item, i) => (
                    <React.Fragment key={item.label}>
                      <View style={[styles.apiRow, { alignItems: "center" }]}>
                        <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: "#16a34a18", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                          <Feather name={item.icon as any} size={16} color="#4ade80" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.apiName, { color: colors.foreground }]}>{item.label}</Text>
                          <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>{item.desc}</Text>
                        </View>
                      </View>
                      {i < 2 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    </React.Fragment>
                  ))}
                </View>

                <View style={[gs.infoBanner, { backgroundColor: "#16a34a12", borderColor: "#16a34a35", marginTop: 4 }]}>
                  <Feather name="info" size={14} color="#4ade80" />
                  <Text style={[gs.infoTxt, { color: colors.mutedForeground }]}>
                    Filmes usam IMDB IDs — ex:{" "}
                    <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: colors.foreground }}>tt0118688</Text>
                    {" "}(Batman & Robin) retorna{" "}
                    <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: "#4ade80" }}>{`{"movie":true}`}</Text>
                    . Séries/Animes usam TMDB IDs.
                  </Text>
                </View>
              </>
            )}

            {/* ── Filmes ── */}
            {gSection === "filmes" && (
              <>
                {/* Correct ID format info */}
                <View style={[gs.infoBanner, { backgroundColor: "#16a34a12", borderColor: "#16a34a35", marginBottom: 14 }]}>
                  <Feather name="check-circle" size={14} color="#4ade80" />
                  <Text style={[gs.infoTxt, { color: colors.mutedForeground }]}>
                    <Text style={{ color: "#4ade80", fontWeight: "600" }}>11.433 filmes disponíveis!</Text>
                    {"  "}Filmes usam{" "}
                    <Text style={{ color: colors.foreground, fontWeight: "600" }}>IMDB IDs</Text>
                    {" "}(formato{" "}
                    <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: "#6366f1" }}>tt...</Text>
                    {") — não TMDB IDs."}
                  </Text>
                </View>

                {/* IMDB ID Check */}
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>VERIFICAR POR IMDB ID</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  <TextInput
                    style={[gs.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="IMDB ID (ex: tt0137523)"
                    placeholderTextColor={colors.mutedForeground}
                    value={gMovieId}
                    onChangeText={(t) => { setGMovieId(t); setGMovieResult("idle"); }}
                    autoCapitalize="none"
                    returnKeyType="search"
                    onSubmitEditing={() => checkGStreamMovie()}
                  />
                  <Pressable
                    onPress={() => checkGStreamMovie()}
                    style={[gs.checkBtn, { backgroundColor: "#6366f1" }]}
                  >
                    {gMovieLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="search" size={16} color="#fff" />
                    )}
                  </Pressable>
                </View>

                {gMovieResult === "found" && (
                  <View style={[gs.resultCard, { backgroundColor: "#16a34a12", borderColor: "#16a34a40", marginBottom: 16 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <Feather name="check-circle" size={20} color="#4ade80" />
                      <View style={{ flex: 1 }}>
                        <Text style={[gs.resultTitle, { color: "#4ade80" }]}>Disponível no GStream!</Text>
                        {gMovieTitle ? <Text style={[styles.apiDetail, { color: colors.mutedForeground, marginTop: 2 }]}>{gMovieTitle}</Text> : null}
                      </View>
                    </View>
                    <Text style={[gs.resultUrl, { color: colors.mutedForeground }]} numberOfLines={1}>{gMovieUrl}</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                      <Pressable
                        onPress={() => openGPlayer(gMovieUrl, gMovieTitle || `Filme ${gMovieId}`)}
                        style={[gs.playBtn, { backgroundColor: "#6366f1", flex: 1 }]}
                      >
                        <Feather name="play" size={15} color="#fff" />
                        <Text style={gs.playBtnTxt}>Testar Player</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => copyText(gMovieUrl)}
                        style={[gs.playBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                      >
                        <Feather name="copy" size={15} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  </View>
                )}

                {gMovieResult === "notfound" && (
                  <View style={[gs.resultCard, { backgroundColor: `${RED}10`, borderColor: `${RED}35`, marginBottom: 16 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Feather name="x-circle" size={20} color={RED} />
                      <Text style={[gs.resultTitle, { color: RED }]}>Não encontrado no GStream</Text>
                    </View>
                    <Text style={[styles.apiDetail, { color: colors.mutedForeground, marginTop: 6 }]}>
                      {gMovieId} não está na base. Tente buscar pelo título abaixo.
                    </Text>
                  </View>
                )}

                {/* Search by title */}
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>
                  BUSCAR POR TÍTULO{gCatalogTotal !== null ? `  (${gCatalogTotal.toLocaleString()} filmes)` : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  <TextInput
                    style={[gs.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Nome do filme (ex: Batman, Vingadores...)"
                    placeholderTextColor={colors.mutedForeground}
                    value={gCatalogSearch}
                    onChangeText={(t) => { setGCatalogSearch(t); if (!t.trim()) setGCatalogResults([]); }}
                    returnKeyType="search"
                    onSubmitEditing={() => searchGStreamCatalog(gCatalogSearch)}
                  />
                  <Pressable
                    onPress={() => searchGStreamCatalog(gCatalogSearch)}
                    style={[gs.checkBtn, { backgroundColor: "#6366f1" }]}
                  >
                    {gCatalogLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="search" size={16} color="#fff" />
                    )}
                  </Pressable>
                </View>

                {gCatalogResults.length > 0 && (
                  <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
                    {gCatalogResults.slice(0, 20).map((item, i) => (
                      <React.Fragment key={item.id}>
                        <Pressable
                          onPress={() => checkGStreamMovie(String(item.embed), item.title)}
                          style={[styles.apiRow, { paddingVertical: 11, alignItems: "center" }]}
                        >
                          {item.image ? (
                            <Image source={{ uri: item.image }} style={{ width: 36, height: 52, borderRadius: 4, marginRight: 10, backgroundColor: colors.border }} resizeMode="cover" />
                          ) : (
                            <View style={{ width: 36, height: 52, borderRadius: 4, marginRight: 10, backgroundColor: `#6366f120`, alignItems: "center", justifyContent: "center" }}>
                              <Feather name="film" size={14} color="#6366f1" />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.apiName, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
                            <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>IMDB: {item.embed}</Text>
                          </View>
                          <Feather name="search" size={14} color="#6366f1" />
                        </Pressable>
                        {i < gCatalogResults.length - 1 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                      </React.Fragment>
                    ))}
                    {gCatalogResults.length > 20 && (
                      <Text style={[styles.apiDetail, { color: colors.mutedForeground, textAlign: "center", padding: 10 }]}>
                        +{gCatalogResults.length - 20} resultados — refine a busca
                      </Text>
                    )}
                  </View>
                )}

                {gCatalogSearch.trim() && gCatalogResults.length === 0 && !gCatalogLoading && (
                  <View style={[gs.infoBanner, { backgroundColor: `${RED}10`, borderColor: `${RED}25`, marginBottom: 16 }]}>
                    <Feather name="info" size={14} color={colors.mutedForeground} />
                    <Text style={[gs.infoTxt, { color: colors.mutedForeground }]}>Nenhum resultado para "{gCatalogSearch}". Tente outro nome.</Text>
                  </View>
                )}

                {/* Quick IMDB examples */}
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>EXEMPLOS RÁPIDOS (IMDB IDs)</Text>
                <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { id: "tt0118688", title: "Batman & Robin" },
                    { id: "tt21110654", title: "Batman Azteca: Choque de Impérios" },
                    { id: "tt12794046", title: "Batman: Morte em Família" },
                    { id: "tt9661164", title: "No Ordinary Heist" },
                  ].map((ex, i) => (
                    <React.Fragment key={ex.id}>
                      <Pressable
                        onPress={() => checkGStreamMovie(ex.id, ex.title)}
                        style={[styles.apiRow, { paddingVertical: 12 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.apiName, { color: colors.foreground }]}>{ex.title}</Text>
                          <Text style={[styles.apiLatency, { color: colors.mutedForeground, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>{ex.id}</Text>
                        </View>
                        <Feather name="search" size={14} color="#6366f1" />
                      </Pressable>
                      {i < 3 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}

            {/* ── Séries ── */}
            {gSection === "series" && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>TESTAR PLAYER DE SÉRIE</Text>
                <View style={[gs.infoBanner, { backgroundColor: "#6366f110", borderColor: "#6366f130", marginBottom: 14 }]}>
                  <Feather name="info" size={14} color="#6366f1" />
                  <Text style={[gs.infoTxt, { color: colors.mutedForeground }]}>
                    Digite o TMDB ID da série, temporada e episódio (ex: 1396 = Breaking Bad)
                  </Text>
                </View>

                <View style={{ gap: 8, marginBottom: 14 }}>
                  <TextInput
                    style={[gs.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="TMDB ID da série (ex: 1396)"
                    placeholderTextColor={colors.mutedForeground}
                    value={gTvId}
                    onChangeText={setGTvId}
                    keyboardType="numeric"
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={[gs.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Temporada"
                      placeholderTextColor={colors.mutedForeground}
                      value={gTvSeason}
                      onChangeText={setGTvSeason}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[gs.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Episódio"
                      placeholderTextColor={colors.mutedForeground}
                      value={gTvEpisode}
                      onChangeText={setGTvEpisode}
                      keyboardType="numeric"
                    />
                  </View>
                  <Pressable
                    onPress={() => checkGStreamTv(false)}
                    style={[gs.verifyBtn, { backgroundColor: "#6366f1" }]}
                  >
                    {gTvLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="search" size={15} color="#fff" />
                        <Text style={gs.verifyBtnTxt}>Verificar Disponibilidade</Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {gTvResult && (
                  <View style={[gs.resultCard, {
                    backgroundColor: (gTvResult.dub || gTvResult.leg) ? "#16a34a12" : `${RED}10`,
                    borderColor: (gTvResult.dub || gTvResult.leg) ? "#16a34a40" : `${RED}35`,
                  }]}>
                    <Text style={[gs.resultTitle, { color: (gTvResult.dub || gTvResult.leg) ? "#4ade80" : RED, marginBottom: 12 }]}>
                      {(gTvResult.dub || gTvResult.leg) ? "Disponível no GStream!" : "Não disponível"}
                    </Text>
                    {gTvResult.dub && (
                      <Pressable
                        onPress={() => openGPlayer(gTvDubUrl, `Série #${gTvId} S${gTvSeason}E${gTvEpisode} DUB`)}
                        style={[gs.playBtn, { backgroundColor: "#6366f1", marginBottom: 8 }]}
                      >
                        <Feather name="play" size={15} color="#fff" />
                        <Text style={gs.playBtnTxt}>🇧🇷 Assistir Dublado</Text>
                      </Pressable>
                    )}
                    {gTvResult.leg && (
                      <Pressable
                        onPress={() => openGPlayer(gTvLegUrl, `Série #${gTvId} S${gTvSeason}E${gTvEpisode} LEG`)}
                        style={[gs.playBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: "#6366f150" }]}
                      >
                        <Feather name="play" size={15} color="#6366f1" />
                        <Text style={[gs.playBtnTxt, { color: "#6366f1" }]}>🇺🇸 Assistir Legendado</Text>
                      </Pressable>
                    )}
                    {!gTvResult.dub && !gTvResult.leg && (
                      <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>
                        Nenhuma versão encontrada para T{gTvSeason}E{gTvEpisode}
                      </Text>
                    )}
                  </View>
                )}

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 22, marginBottom: 10 }]}>EXEMPLOS RÁPIDOS</Text>
                <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { id: "1396", title: "Breaking Bad", s: "1", e: "1" },
                    { id: "60735", title: "The Flash", s: "1", e: "1" },
                    { id: "66732", title: "Stranger Things", s: "1", e: "1" },
                  ].map((ex, i) => (
                    <React.Fragment key={ex.id}>
                      <Pressable
                        onPress={() => { setGTvId(ex.id); setGTvSeason(ex.s); setGTvEpisode(ex.e); setGTvResult(null); }}
                        style={[styles.apiRow, { paddingVertical: 12 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.apiName, { color: colors.foreground }]}>{ex.title}</Text>
                          <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>ID: {ex.id} · T{ex.s}E{ex.e}</Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      </Pressable>
                      {i < 2 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}

            {/* ── Animes ── */}
            {gSection === "animes" && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>TESTAR PLAYER DE ANIME</Text>
                <View style={[gs.infoBanner, { backgroundColor: "#6366f110", borderColor: "#6366f130", marginBottom: 14 }]}>
                  <Feather name="info" size={14} color="#6366f1" />
                  <Text style={[gs.infoTxt, { color: colors.mutedForeground }]}>
                    Animes usam a mesma API que séries. Use o TMDB ID do anime (ex: 46260 = Sword Art Online)
                  </Text>
                </View>

                <View style={{ gap: 8, marginBottom: 14 }}>
                  <TextInput
                    style={[gs.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="TMDB ID do anime (ex: 46260)"
                    placeholderTextColor={colors.mutedForeground}
                    value={gAnimeId}
                    onChangeText={setGAnimeId}
                    keyboardType="numeric"
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={[gs.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Temporada"
                      placeholderTextColor={colors.mutedForeground}
                      value={gAnimeSeason}
                      onChangeText={setGAnimeSeason}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[gs.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Episódio"
                      placeholderTextColor={colors.mutedForeground}
                      value={gAnimeEpisode}
                      onChangeText={setGAnimeEpisode}
                      keyboardType="numeric"
                    />
                  </View>
                  <Pressable
                    onPress={() => checkGStreamTv(true)}
                    style={[gs.verifyBtn, { backgroundColor: "#6366f1" }]}
                  >
                    {gAnimeLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="search" size={15} color="#fff" />
                        <Text style={gs.verifyBtnTxt}>Verificar Disponibilidade</Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {gAnimeResult && (
                  <View style={[gs.resultCard, {
                    backgroundColor: (gAnimeResult.dub || gAnimeResult.leg) ? "#16a34a12" : `${RED}10`,
                    borderColor: (gAnimeResult.dub || gAnimeResult.leg) ? "#16a34a40" : `${RED}35`,
                  }]}>
                    <Text style={[gs.resultTitle, { color: (gAnimeResult.dub || gAnimeResult.leg) ? "#4ade80" : RED, marginBottom: 12 }]}>
                      {(gAnimeResult.dub || gAnimeResult.leg) ? "Disponível no GStream!" : "Não disponível"}
                    </Text>
                    {gAnimeResult.dub && (
                      <Pressable
                        onPress={() => openGPlayer(gAnimeDubUrl, `Anime #${gAnimeId} S${gAnimeSeason}E${gAnimeEpisode} DUB`)}
                        style={[gs.playBtn, { backgroundColor: "#6366f1", marginBottom: 8 }]}
                      >
                        <Feather name="play" size={15} color="#fff" />
                        <Text style={gs.playBtnTxt}>🇧🇷 Assistir Dublado</Text>
                      </Pressable>
                    )}
                    {gAnimeResult.leg && (
                      <Pressable
                        onPress={() => openGPlayer(gAnimeLegUrl, `Anime #${gAnimeId} S${gAnimeSeason}E${gAnimeEpisode} LEG`)}
                        style={[gs.playBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: "#6366f150" }]}
                      >
                        <Feather name="play" size={15} color="#6366f1" />
                        <Text style={[gs.playBtnTxt, { color: "#6366f1" }]}>🇺🇸 Assistir Legendado</Text>
                      </Pressable>
                    )}
                    {!gAnimeResult.dub && !gAnimeResult.leg && (
                      <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>
                        Nenhuma versão encontrada para T{gAnimeSeason}E{gAnimeEpisode}
                      </Text>
                    )}
                  </View>
                )}

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 22, marginBottom: 10 }]}>EXEMPLOS RÁPIDOS</Text>
                <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { id: "46260", title: "Sword Art Online", s: "1", e: "1" },
                    { id: "31911", title: "Fairy Tail", s: "1", e: "1" },
                    { id: "37854", title: "One Piece", s: "1", e: "1" },
                  ].map((ex, i) => (
                    <React.Fragment key={ex.id}>
                      <Pressable
                        onPress={() => { setGAnimeId(ex.id); setGAnimeSeason(ex.s); setGAnimeEpisode(ex.e); setGAnimeResult(null); }}
                        style={[styles.apiRow, { paddingVertical: 12 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.apiName, { color: colors.foreground }]}>{ex.title}</Text>
                          <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>ID: {ex.id} · T{ex.s}E{ex.e}</Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      </Pressable>
                      {i < 2 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}

            {/* ── API Docs ── */}
            {gSection === "api" && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>ENDPOINTS DA API</Text>
                {[
                  {
                    method: "GET",
                    label: "Verificar Filme",
                    endpoint: "https://embed.embedplayer.site/dooplay?movie={tmdb_id}",
                    desc: "Retorna {movie: true/false}. Verifica se o filme está disponível.",
                    color: "#22c55e",
                  },
                  {
                    method: "EMBED",
                    label: "Player de Filme",
                    endpoint: "https://embed.embedplayer.site/{tmdb_id}",
                    desc: "URL do iframe/WebView para reproduzir o filme.",
                    color: "#6366f1",
                  },
                  {
                    method: "GET",
                    label: "Verificar Série/Anime",
                    endpoint: "https://embed.embedplayer.site/tv/{id}/{season}/{ep}/lang",
                    desc: "Retorna {dub: bool, leg: bool}. Verifica disponibilidade de dublagem e legenda.",
                    color: "#22c55e",
                  },
                  {
                    method: "EMBED",
                    label: "Player Dublado",
                    endpoint: "https://embed.embedplayer.site/tv/{id}/{season}/{ep}/dub",
                    desc: "URL do player para versão dublada em português.",
                    color: "#6366f1",
                  },
                  {
                    method: "EMBED",
                    label: "Player Legendado",
                    endpoint: "https://embed.embedplayer.site/tv/{id}/{season}/{ep}/leg",
                    desc: "URL do player para versão legendada.",
                    color: "#f59e0b",
                  },
                ].map((ep, i) => (
                  <View key={ep.label} style={[gs.apiEndpoint, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <View style={[gs.methodBadge, { backgroundColor: ep.color + "20", borderColor: ep.color + "50" }]}>
                        <Text style={[gs.methodTxt, { color: ep.color }]}>{ep.method}</Text>
                      </View>
                      <Text style={[styles.apiName, { color: colors.foreground }]}>{ep.label}</Text>
                    </View>
                    <View style={[gs.endpointRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[gs.endpointTxt, { color: "#6366f1", flex: 1 }]} numberOfLines={2}>{ep.endpoint}</Text>
                      <Pressable onPress={() => copyText(ep.endpoint)} style={{ padding: 4 }}>
                        <Feather name="copy" size={14} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                    <Text style={[styles.apiDetail, { color: colors.mutedForeground, marginTop: 6 }]}>{ep.desc}</Text>
                  </View>
                ))}

                <View style={[gs.infoBanner, { backgroundColor: GOLD + "10", borderColor: GOLD + "30", marginTop: 8 }]}>
                  <Feather name="alert-circle" size={14} color={GOLD} />
                  <Text style={[gs.infoTxt, { color: colors.mutedForeground }]}>
                    A API pode ter restrições de CORS em ambiente web. No app nativo (WebView) funciona normalmente.
                  </Text>
                </View>
              </>
            )}
          </>
        )}

        {/* ── ABA WAREZCDN ── */}
        {activeTab === "warez" && (
          <>
            {/* Header */}
            <View style={[wz.header, { backgroundColor: "#f9731615", borderColor: "#f9731630" }]}>
              <View style={wz.headerIcon}>
                <Feather name="globe" size={22} color="#f97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[wz.headerTitle, { color: colors.foreground }]}>WarezCDN</Text>
                <Text style={[wz.headerSub, { color: colors.mutedForeground }]}>warezcdn.lat — Sandbox com ad blocker + explorador de API</Text>
              </View>
            </View>

            {/* Sub-nav */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 12 }}>
                {(["player", "catalogo", "canais", "eventos", "pesquisa"] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => { setWSection(s); setWResults([]); setWError(null); }}
                    style={[wz.subTab, {
                      backgroundColor: wSection === s ? "#f97316" : colors.card,
                      borderColor: wSection === s ? "#f97316" : colors.border,
                    }]}
                  >
                    <Feather
                      name={s === "player" ? "play-circle" : s === "catalogo" ? "film" : s === "canais" ? "tv" : s === "eventos" ? "zap" : "search"}
                      size={13}
                      color={wSection === s ? "#fff" : colors.mutedForeground}
                    />
                    <Text style={[wz.subTabTxt, { color: wSection === s ? "#fff" : colors.mutedForeground }]}>
                      {s === "player" ? "Sandbox" : s === "catalogo" ? "Catálogo" : s === "canais" ? "Canais" : s === "eventos" ? "Eventos" : "Pesquisa"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* ── Sandbox Player ── */}
            {wSection === "player" && (
              <>
                <View style={[wz.infoBanner, { backgroundColor: "#f9731612", borderColor: "#f9731630", marginBottom: 16 }]}>
                  <Feather name="shield" size={14} color="#f97316" />
                  <Text style={[wz.infoTxt, { color: colors.mutedForeground }]}>
                    Sandbox com <Text style={{ color: "#f97316", fontWeight: "700" }}>bloqueio de anúncios ativo</Text> — teste qualquer embed do WarezCDN antes de integrar ao app.
                  </Text>
                </View>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>TIPO DE CONTEÚDO</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                  {(["filme", "serie"] as const).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setWEmbedType(t)}
                      style={[wz.typeBtn, {
                        backgroundColor: wEmbedType === t ? "#f9731620" : colors.card,
                        borderColor: wEmbedType === t ? "#f97316" : colors.border,
                        flex: 1,
                      }]}
                    >
                      <Feather name={t === "filme" ? "film" : "tv"} size={15} color={wEmbedType === t ? "#f97316" : colors.mutedForeground} />
                      <Text style={[wz.typeBtnTxt, { color: wEmbedType === t ? "#f97316" : colors.mutedForeground }]}>
                        {t === "filme" ? "Filme" : "Série / Anime"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>
                  {wEmbedType === "filme" ? "ID DO FILME (IMDB ou TMDB)" : "ID DA SÉRIE (TMDB)"}
                </Text>
                <TextInput
                  style={[wz.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, marginBottom: 10 }]}
                  placeholder={wEmbedType === "filme" ? "ex: tt0068646 ou 238" : "ex: 1396 (Breaking Bad)"}
                  placeholderTextColor={colors.mutedForeground}
                  value={wEmbedId}
                  onChangeText={setWEmbedId}
                  autoCapitalize="none"
                />

                {wEmbedType === "serie" && (
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>TEMPORADA</Text>
                      <TextInput
                        style={[wz.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                        placeholder="1"
                        placeholderTextColor={colors.mutedForeground}
                        value={wEmbedSeason}
                        onChangeText={setWEmbedSeason}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>EPISÓDIO</Text>
                      <TextInput
                        style={[wz.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                        placeholder="1"
                        placeholderTextColor={colors.mutedForeground}
                        value={wEmbedEpisode}
                        onChangeText={setWEmbedEpisode}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                )}

                {wEmbedId.trim() !== "" && (
                  <View style={[wz.urlPreview, { backgroundColor: colors.card, borderColor: "#f9731640", marginBottom: 12 }]}>
                    <Text style={[wz.urlLabel, { color: colors.mutedForeground }]}>URL DO EMBED</Text>
                    <Text style={[wz.urlText, { color: "#f97316" }]} numberOfLines={2}>{buildWarezEmbed()}</Text>
                  </View>
                )}

                <Pressable
                  onPress={() => {
                    const url = buildWarezEmbed();
                    if (url) openWPlayer(url, wEmbedType === "filme" ? `Filme ${wEmbedId}` : `Série ${wEmbedId} T${wEmbedSeason}E${wEmbedEpisode}`);
                  }}
                  style={[wz.playBtn, {
                    backgroundColor: wEmbedId.trim() ? "#f97316" : colors.card,
                    borderColor: wEmbedId.trim() ? "#f97316" : colors.border,
                    borderWidth: 1,
                    marginBottom: 24,
                  }]}
                >
                  <Feather name="play" size={16} color={wEmbedId.trim() ? "#fff" : colors.mutedForeground} />
                  <Text style={[wz.playBtnTxt, { color: wEmbedId.trim() ? "#fff" : colors.mutedForeground }]}>Abrir no Sandbox</Text>
                </Pressable>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>ENDPOINTS DO PLAYER</Text>
                {[
                  { label: "Filme", endpoint: `${WAREZ_BASE}/filme/{ID}`, desc: "Aceita IMDB (tt...) ou TMDB numérico" },
                  { label: "Série / Anime / Dorama", endpoint: `${WAREZ_BASE}/serie/{TMDB_ID}/{season}/{episode}`, desc: "Unificado para séries, animes e doramas" },
                  { label: "Catálogo /lista", endpoint: `${WAREZ_BASE}/lista?category=filme&format=json`, desc: "Lista pública de IDs disponíveis" },
                  { label: "Pesquisa global", endpoint: `${WAREZ_BASE}/lista?category=pesquisa&q=QUERY&format=json`, desc: "Busca unificada em conteúdos, canais e eventos" },
                  { label: "Canais", endpoint: `${WAREZ_BASE}/lista?category=canais&format=json`, desc: "Lista de canais com dados de stream e logo" },
                  { label: "Eventos esportivos", endpoint: `${WAREZ_BASE}/lista?category=eventos&sport=futebol&format=json`, desc: "Jogos ao vivo e agendados" },
                ].map((ep) => (
                  <View key={ep.label} style={[wz.endpointCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <View style={[wz.endpointBadge, { backgroundColor: "#f9731620", borderColor: "#f9731640" }]}>
                        <Text style={[wz.endpointMethod, { color: "#f97316" }]}>GET</Text>
                      </View>
                      <Text style={[styles.apiName, { color: colors.foreground }]}>{ep.label}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 }}>
                      <Text style={{ flex: 1, fontSize: 11, color: "#f97316", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} numberOfLines={2}>{ep.endpoint}</Text>
                      <Pressable onPress={() => copyText(ep.endpoint)}><Feather name="copy" size={13} color={colors.mutedForeground} /></Pressable>
                    </View>
                    <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>{ep.desc}</Text>
                  </View>
                ))}
              </>
            )}

            {/* ── Catálogo ── */}
            {wSection === "catalogo" && (
              <>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {(["filme", "serie", "anime", "dorama"] as const).map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => { setWCategory(c); setWResults([]); setWError(null); }}
                      style={[wz.catBtn, {
                        backgroundColor: wCategory === c ? "#f9731620" : colors.card,
                        borderColor: wCategory === c ? "#f97316" : colors.border,
                      }]}
                    >
                      <Text style={[wz.catBtnTxt, { color: wCategory === c ? "#f97316" : colors.mutedForeground }]}>
                        {c === "filme" ? "🎬 Filmes" : c === "serie" ? "📺 Séries" : c === "anime" ? "⚡ Animes" : "🌸 Doramas"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  <TextInput
                    style={[wz.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Filtrar por gênero (ex: acao, drama, romance)"
                    placeholderTextColor={colors.mutedForeground}
                    value={wGenre}
                    onChangeText={setWGenre}
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() => fetchWarezList(wCategory, undefined, wGenre || undefined)}
                    style={[wz.searchBtn, { backgroundColor: "#f97316" }]}
                  >
                    {wLoading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="download-cloud" size={16} color="#fff" />}
                  </Pressable>
                </View>

                {wError && (
                  <View style={[wz.infoBanner, { backgroundColor: `${RED}10`, borderColor: `${RED}30`, marginBottom: 12 }]}>
                    <Feather name="alert-circle" size={14} color={RED} />
                    <Text style={[wz.infoTxt, { color: RED }]}>{wError}</Text>
                  </View>
                )}

                {wResults.length > 0 && (
                  <>
                    <View style={[wz.infoBanner, { backgroundColor: "#f9731612", borderColor: "#f9731630", marginBottom: 12 }]}>
                      <Feather name="list" size={14} color="#f97316" />
                      <Text style={[wz.infoTxt, { color: colors.mutedForeground }]}>
                        <Text style={{ color: "#f97316", fontWeight: "700" }}>{wResults.length} itens</Text> carregados. Toque para abrir no sandbox.
                      </Text>
                    </View>
                    {wResults.slice(0, 60).map((item: any, idx: number) => {
                      const id = typeof item === "string" || typeof item === "number" ? String(item) : item?.id ?? item?.tmdb_id ?? item?.imdb_id ?? `#${idx}`;
                      const title = item?.title ?? item?.name ?? item?.titulo ?? "";
                      const poster = item?.poster ?? item?.poster_path ?? item?.image ?? "";
                      return (
                        <Pressable
                          key={idx}
                          onPress={() => {
                            const isMovie = wCategory === "filme";
                            const url = isMovie ? `${WAREZ_BASE}/filme/${id}` : `${WAREZ_BASE}/serie/${id}/1/1`;
                            openWPlayer(url, title || `${wCategory} ${id}`);
                          }}
                          style={[wz.resultRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                        >
                          {poster ? (
                            <Image source={{ uri: poster.startsWith("http") ? poster : `https://image.tmdb.org/t/p/w92${poster}` }} style={wz.poster} />
                          ) : (
                            <View style={[wz.posterPlaceholder, { backgroundColor: colors.cardElevated ?? colors.background }]}>
                              <Feather name="film" size={16} color={colors.mutedForeground} />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[wz.resultId, { color: "#f97316" }]}>ID: {id}</Text>
                            {title ? <Text style={[wz.resultTitle, { color: colors.foreground }]} numberOfLines={1}>{title}</Text> : null}
                          </View>
                          <Feather name="play-circle" size={20} color="#f97316" />
                        </Pressable>
                      );
                    })}
                    {wResults.length > 60 && (
                      <Text style={[styles.apiDetail, { color: colors.mutedForeground, textAlign: "center", paddingVertical: 8 }]}>
                        Mostrando 60 de {wResults.length} itens
                      </Text>
                    )}
                  </>
                )}

                {!wLoading && wResults.length === 0 && !wError && (
                  <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                    <Feather name="film" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Selecione uma categoria e toque em Carregar</Text>
                  </View>
                )}
              </>
            )}

            {/* ── Canais ── */}
            {wSection === "canais" && (
              <>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  <TextInput
                    style={[wz.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Buscar canal (ex: sportv, globo, ESPN)"
                    placeholderTextColor={colors.mutedForeground}
                    value={wChannelQ}
                    onChangeText={setWChannelQ}
                    autoCapitalize="none"
                    returnKeyType="search"
                    onSubmitEditing={() => fetchWarezList("canais", wChannelQ || undefined)}
                  />
                  <Pressable
                    onPress={() => fetchWarezList("canais", wChannelQ || undefined)}
                    style={[wz.searchBtn, { backgroundColor: "#f97316" }]}
                  >
                    {wLoading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="search" size={16} color="#fff" />}
                  </Pressable>
                </View>

                {wError && (
                  <View style={[wz.infoBanner, { backgroundColor: `${RED}10`, borderColor: `${RED}30`, marginBottom: 12 }]}>
                    <Feather name="alert-circle" size={14} color={RED} />
                    <Text style={[wz.infoTxt, { color: RED }]}>{wError}</Text>
                  </View>
                )}

                {wResults.map((ch: any, idx: number) => {
                  const name = ch?.name ?? ch?.title ?? ch?.canal ?? `Canal ${idx + 1}`;
                  const logo = ch?.logo ?? ch?.image ?? "";
                  const streamUrl = ch?.stream_url ?? ch?.url ?? ch?.player ?? "";
                  const genre = ch?.genre ?? ch?.category ?? "";
                  return (
                    <View key={idx} style={[wz.channelRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {logo ? (
                        <Image source={{ uri: logo }} style={wz.channelLogo} resizeMode="contain" />
                      ) : (
                        <View style={[wz.channelLogoPlaceholder, { backgroundColor: colors.background }]}>
                          <Feather name="tv" size={16} color="#f97316" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[wz.channelName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
                        {genre ? <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>{genre}</Text> : null}
                      </View>
                      {streamUrl ? (
                        <Pressable
                          onPress={() => openWPlayer(streamUrl, name)}
                          style={[wz.playSmall, { backgroundColor: "#f9731620", borderColor: "#f9731640" }]}
                        >
                          <Feather name="play" size={13} color="#f97316" />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}

                {!wLoading && wResults.length === 0 && !wError && (
                  <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                    <Feather name="tv" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Busque um canal pelo nome ou carregue todos</Text>
                  </View>
                )}
              </>
            )}

            {/* ── Eventos ── */}
            {wSection === "eventos" && (
              <>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  {[
                    { key: "", label: "Todos" },
                    { key: "futebol", label: "⚽ Futebol" },
                    { key: "basquete", label: "🏀 Basquete" },
                    { key: "mma", label: "🥊 MMA" },
                    { key: "golfe", label: "⛳ Golfe" },
                    { key: "volei", label: "🏐 Vôlei" },
                  ].map((sp) => (
                    <Pressable
                      key={sp.key}
                      onPress={() => setWEventSport(sp.key)}
                      style={[wz.catBtn, {
                        backgroundColor: wEventSport === sp.key ? "#f9731620" : colors.card,
                        borderColor: wEventSport === sp.key ? "#f97316" : colors.border,
                      }]}
                    >
                      <Text style={[wz.catBtnTxt, { color: wEventSport === sp.key ? "#f97316" : colors.mutedForeground }]}>{sp.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  onPress={() => fetchWarezList("eventos", undefined, undefined, wEventSport ? { sport: wEventSport } : undefined)}
                  style={[wz.playBtn, { backgroundColor: "#f97316", marginBottom: 14 }]}
                >
                  {wLoading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="zap" size={15} color="#fff" />}
                  <Text style={[wz.playBtnTxt, { color: "#fff" }]}>Buscar Eventos</Text>
                </Pressable>

                {wError && (
                  <View style={[wz.infoBanner, { backgroundColor: `${RED}10`, borderColor: `${RED}30`, marginBottom: 12 }]}>
                    <Feather name="alert-circle" size={14} color={RED} />
                    <Text style={[wz.infoTxt, { color: RED }]}>{wError}</Text>
                  </View>
                )}

                {wResults.map((ev: any, idx: number) => {
                  const title = ev?.title ?? ev?.name ?? `Evento ${idx + 1}`;
                  const team1 = ev?.team1 ?? ev?.home ?? "";
                  const team2 = ev?.team2 ?? ev?.away ?? "";
                  const logo1 = ev?.logo1 ?? ev?.home_logo ?? ev?.event_logo ?? "";
                  const logo2 = ev?.logo2 ?? ev?.away_logo ?? "";
                  const cover = ev?.cover ?? ev?.thumb ?? ev?.image ?? "";
                  const status = ev?.status ?? "";
                  const competition = ev?.competition ?? ev?.league ?? "";
                  const players: any[] = ev?.players ?? [];
                  return (
                    <View key={idx} style={[wz.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {cover ? <Image source={{ uri: cover }} style={wz.eventCover} resizeMode="cover" /> : null}
                      <View style={{ padding: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          {status === "live" && (
                            <View style={{ backgroundColor: "#ef444420", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ color: "#ef4444", fontSize: 10, fontWeight: "800" }}>🔴 AO VIVO</Text>
                            </View>
                          )}
                          {competition ? <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>{competition}</Text> : null}
                        </View>
                        {team1 && team2 ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            {logo1 ? <Image source={{ uri: logo1 }} style={wz.teamLogo} resizeMode="contain" /> : null}
                            <View style={{ flex: 1 }}>
                              <Text style={[wz.resultTitle, { color: colors.foreground }]} numberOfLines={1}>{team1}</Text>
                              <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>vs</Text>
                              <Text style={[wz.resultTitle, { color: colors.foreground }]} numberOfLines={1}>{team2}</Text>
                            </View>
                            {logo2 ? <Image source={{ uri: logo2 }} style={wz.teamLogo} resizeMode="contain" /> : null}
                          </View>
                        ) : (
                          <Text style={[wz.resultTitle, { color: colors.foreground, marginBottom: 8 }]} numberOfLines={2}>{title}</Text>
                        )}
                        {players.length > 0 && (
                          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                            {players.slice(0, 4).map((p: any, pi: number) => {
                              const pUrl = p?.url ?? p?.stream_url ?? p?.link ?? (typeof p === "string" ? p : "");
                              const pLabel = p?.name ?? p?.label ?? `P${pi + 1}`;
                              return pUrl ? (
                                <Pressable
                                  key={pi}
                                  onPress={() => openWPlayer(pUrl, `${title} — ${pLabel}`)}
                                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f9731620", borderWidth: 1, borderColor: "#f9731640", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                                >
                                  <Feather name="play" size={11} color="#f97316" />
                                  <Text style={{ color: "#f97316", fontSize: 11, fontWeight: "700" }}>{pLabel}</Text>
                                </Pressable>
                              ) : null;
                            })}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}

                {!wLoading && wResults.length === 0 && !wError && (
                  <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                    <Feather name="zap" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Selecione um esporte e busque eventos</Text>
                  </View>
                )}
              </>
            )}

            {/* ── Pesquisa global ── */}
            {wSection === "pesquisa" && (
              <>
                <View style={[wz.infoBanner, { backgroundColor: "#f9731612", borderColor: "#f9731630", marginBottom: 14 }]}>
                  <Feather name="info" size={14} color="#f97316" />
                  <Text style={[wz.infoTxt, { color: colors.mutedForeground }]}>
                    Busca unificada em filmes, séries, canais e eventos disponíveis no WarezCDN.
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  <TextInput
                    style={[wz.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="ex: flamengo, breaking bad, ESPN..."
                    placeholderTextColor={colors.mutedForeground}
                    value={wSearch}
                    onChangeText={setWSearch}
                    autoCapitalize="none"
                    returnKeyType="search"
                    onSubmitEditing={() => fetchWarezList("pesquisa", wSearch)}
                  />
                  <Pressable
                    onPress={() => fetchWarezList("pesquisa", wSearch)}
                    style={[wz.searchBtn, { backgroundColor: "#f97316" }]}
                  >
                    {wLoading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="search" size={16} color="#fff" />}
                  </Pressable>
                </View>

                {wError && (
                  <View style={[wz.infoBanner, { backgroundColor: `${RED}10`, borderColor: `${RED}30`, marginBottom: 12 }]}>
                    <Feather name="alert-circle" size={14} color={RED} />
                    <Text style={[wz.infoTxt, { color: RED }]}>{wError}</Text>
                  </View>
                )}

                {wResults.map((item: any, idx: number) => {
                  const id = item?.id ?? item?.tmdb_id ?? item?.imdb_id ?? `${idx}`;
                  const title = item?.title ?? item?.name ?? item?.canal ?? `Resultado ${idx + 1}`;
                  const type = item?.type ?? item?.category ?? "";
                  const poster = item?.poster ?? item?.logo ?? item?.image ?? "";
                  const streamUrl = item?.stream_url ?? item?.url ?? "";
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        const url = streamUrl
                          ? streamUrl
                          : type === "filme"
                            ? `${WAREZ_BASE}/filme/${id}`
                            : `${WAREZ_BASE}/serie/${id}/1/1`;
                        if (url) openWPlayer(url, title);
                      }}
                      style={[wz.resultRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      {poster ? (
                        <Image source={{ uri: poster.startsWith("http") ? poster : `https://image.tmdb.org/t/p/w92${poster}` }} style={wz.poster} />
                      ) : (
                        <View style={[wz.posterPlaceholder, { backgroundColor: colors.background }]}>
                          <Feather name={type === "canal" ? "tv" : "film"} size={16} color={colors.mutedForeground} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[wz.resultTitle, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                          {type ? (
                            <View style={{ backgroundColor: "#f9731620", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ color: "#f97316", fontSize: 10, fontWeight: "700" }}>{type.toUpperCase()}</Text>
                            </View>
                          ) : null}
                          {id ? <Text style={[styles.apiDetail, { color: colors.mutedForeground }]}>ID: {id}</Text> : null}
                        </View>
                      </View>
                      <Feather name="play-circle" size={20} color="#f97316" />
                    </Pressable>
                  );
                })}

                {!wLoading && wResults.length === 0 && !wError && (
                  <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                    <Feather name="search" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Digite algo para pesquisar</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* ── CONTAS TAB ── */}
        {activeTab === "contas" && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 16 }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GERENCIAR CONTAS</Text>
              <Pressable
                onPress={() => {
                  setContasLoading(true);
                  db.subscriptions.getAllWithUsers().then((res) => { setContasData(res); setContasLoading(false); }).catch(() => setContasLoading(false));
                }}
                style={[styles.refreshBtn, { backgroundColor: "#22c55e15" }]}
              >
                <Feather name="refresh-cw" size={12} color="#22c55e" />
                <Text style={[styles.refreshText, { color: "#22c55e" }]}>Atualizar</Text>
              </Pressable>
            </View>

            <View style={[styles.infoBox, { backgroundColor: "#22c55e0a", borderColor: "#22c55e20", marginBottom: 16 }]}>
              <Feather name="database" size={14} color="#22c55e" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: "#22c55e" }]}>SQL necessário (execute no Supabase)</Text>
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 10 }]}>
                  {`CREATE TABLE IF NOT EXISTS public.user_subscriptions (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,\n  plan TEXT NOT NULL DEFAULT 'trial',\n  screen_limit INTEGER NOT NULL DEFAULT 1,\n  trial_started_at TIMESTAMPTZ DEFAULT NOW(),\n  plan_activated_at TIMESTAMPTZ,\n  plan_expires_at TIMESTAMPTZ,\n  selected_plan TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nCREATE TABLE IF NOT EXISTS public.active_sessions (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,\n  device_id TEXT NOT NULL,\n  session_token TEXT NOT NULL UNIQUE,\n  started_at TIMESTAMPTZ DEFAULT NOW(),\n  last_heartbeat TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "anon_all_user_subscriptions" ON public.user_subscriptions;\nDROP POLICY IF EXISTS "anon_all_active_sessions" ON public.active_sessions;\nDROP POLICY IF EXISTS "auth_all_user_subscriptions" ON public.user_subscriptions;\nDROP POLICY IF EXISTS "auth_all_active_sessions" ON public.active_sessions;\nCREATE POLICY "anon_all_user_subscriptions" ON public.user_subscriptions FOR ALL TO anon USING (true) WITH CHECK (true);\nCREATE POLICY "anon_all_active_sessions" ON public.active_sessions FOR ALL TO anon USING (true) WITH CHECK (true);\nCREATE POLICY "auth_all_user_subscriptions" ON public.user_subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);\nCREATE POLICY "auth_all_active_sessions" ON public.active_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);`}
                </Text>
              </View>
            </View>

            {contasLoading ? (
              <View style={[styles.centered, { paddingVertical: 40 }]}>
                <ActivityIndicator color="#22c55e" />
                <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Carregando contas...</Text>
              </View>
            ) : contasData.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Feather name="users" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Nenhum usuário encontrado</Text>
              </View>
            ) : (
              contasData.map(({ user: u, sub }) => {
                const plan = sub?.plan ?? "sem plano";
                const planColors: Record<string, string> = { trial: "#f59e0b", basic: "#3b82f6", normal: "#8b5cf6", premium: "#e50914" };
                const planColor = planColors[plan] ?? "#888";
                const isTrialExpired = sub?.plan === "trial" && sub?.trial_started_at
                  ? new Date(sub.trial_started_at).getTime() + 3 * 24 * 60 * 60 * 1000 < Date.now()
                  : false;
                const isPlanExpired = sub?.plan !== "trial" && sub?.plan_expires_at
                  ? new Date(sub.plan_expires_at) < new Date()
                  : false;
                const expiryStr = sub?.plan_expires_at
                  ? new Date(sub.plan_expires_at).toLocaleDateString("pt-BR")
                  : sub?.trial_started_at
                  ? `Trial até ${new Date(new Date(sub.trial_started_at).getTime() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR")}`
                  : "—";

                return (
                  <View key={u.id} style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 10 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: planColor + "22", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: planColor, fontSize: 16, fontWeight: "800" }}>{u.avatar_letter ?? u.name?.[0] ?? "?"}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.requestTitle, { color: colors.foreground, fontSize: 14 }]} numberOfLines={1}>{u.name}</Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>{u.email}</Text>
                      </View>
                      <View style={[styles.typeBadge, { backgroundColor: planColor + "22", borderColor: planColor + "55" }]}>
                        <Text style={[styles.typeTxt, { color: planColor }]}>{plan.toUpperCase()}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Feather name="clock" size={11} color={(isTrialExpired || isPlanExpired) ? RED : colors.mutedForeground} />
                      <Text style={{ color: (isTrialExpired || isPlanExpired) ? RED : colors.mutedForeground, fontSize: 11 }}>
                        {isTrialExpired ? "⚠ Trial expirado" : isPlanExpired ? "⚠ Plano expirado" : expiryStr}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {(["basic", "normal", "premium"] as const).map((p) => {
                        const pLabels = { basic: "Básico", normal: "Normal", premium: "Premium" };
                        const pColors = { basic: "#3b82f6", normal: "#8b5cf6", premium: "#e50914" };
                        const isActive = sub?.plan === p;
                        return (
                          <Pressable
                            key={p}
                            disabled={activatingUser === u.id || blockingUser === u.id}
                            onPress={() => {
                              Alert.alert(
                                `Ativar ${pLabels[p]}`,
                                `Ativar plano ${pLabels[p]} por 30 dias para ${u.name}?`,
                                [
                                  { text: "Cancelar", style: "cancel" },
                                  {
                                    text: "Ativar",
                                    onPress: async () => {
                                      setActivatingUser(u.id ?? "");
                                      const result = await db.subscriptions.activate(u.id!, p, 30);
                                      setActivatingUser(null);
                                      if (result.error) {
                                        Alert.alert("Erro ao ativar plano", result.error);
                                      } else {
                                        const res = await db.subscriptions.getAllWithUsers();
                                        setContasData(res);
                                      }
                                    },
                                  },
                                ]
                              );
                            }}
                            style={[styles.addBtn, {
                              backgroundColor: pColors[p] + (isActive ? "ff" : "55"),
                              paddingHorizontal: 12, paddingVertical: 6, margin: 0,
                              borderWidth: isActive ? 2 : 0,
                              borderColor: isActive ? "#fff" : "transparent",
                            }]}
                          >
                            {activatingUser === u.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                                {isActive ? "✓ " : ""}{pLabels[p]}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}

                      {/* Bloquear / Desbloquear */}
                      <Pressable
                        disabled={blockingUser === u.id || activatingUser === u.id}
                        onPress={() => {
                          const isBlocked = u.blocked === true;
                          Alert.alert(
                            isBlocked ? "Desbloquear conta" : "Bloquear conta",
                            isBlocked
                              ? `Desbloquear ${u.name}? O usuário voltará a ter acesso ao app.`
                              : `Bloquear ${u.name}? O usuário não conseguirá mais fazer login.`,
                            [
                              { text: "Cancelar", style: "cancel" },
                              {
                                text: isBlocked ? "Desbloquear" : "Bloquear",
                                style: isBlocked ? "default" : "destructive",
                                onPress: async () => {
                                  setBlockingUser(u.id ?? "");
                                  const result = await db.users.setBlocked(u.id!, !isBlocked);
                                  setBlockingUser(null);
                                  if (result.error) {
                                    Alert.alert("Erro", result.error);
                                  } else {
                                    const res = await db.subscriptions.getAllWithUsers();
                                    setContasData(res);
                                  }
                                },
                              },
                            ]
                          );
                        }}
                        style={[styles.copyBtn, {
                          borderColor: u.blocked ? "#22c55e55" : "#ef444455",
                          backgroundColor: u.blocked ? "#22c55e15" : "#ef444415",
                        }]}
                      >
                        {blockingUser === u.id ? (
                          <ActivityIndicator size="small" color={u.blocked ? "#22c55e" : "#ef4444"} />
                        ) : (
                          <>
                            <Feather name={u.blocked ? "unlock" : "lock"} size={12} color={u.blocked ? "#22c55e" : "#ef4444"} />
                            <Text style={[styles.copyBtnTxt, { color: u.blocked ? "#22c55e" : "#ef4444" }]}>
                              {u.blocked ? "Desbloquear" : "Bloquear"}
                            </Text>
                          </>
                        )}
                      </Pressable>

                      {/* Ver Detalhes */}
                      <Pressable
                        onPress={() => router.push(`/admin-user?userId=${u.id}`)}
                        style={[styles.copyBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "12" }]}
                      >
                        <Feather name="user" size={12} color={colors.primary} />
                        <Text style={[styles.copyBtnTxt, { color: colors.primary }]}>Ver Detalhes</Text>
                      </Pressable>

                      {/* WhatsApp */}
                      <Pressable
                        onPress={() => {
                          Linking.openURL(`https://wa.me/5596991718167?text=${encodeURIComponent(`Olá ${u.name}, seu plano NETPLAY está pronto! Entre no app para continuar assistindo.`)}`);
                        }}
                        style={[styles.copyBtn, { borderColor: "#22c55e55", backgroundColor: "#22c55e15" }]}
                      >
                        <Feather name="message-circle" size={12} color="#22c55e" />
                        <Text style={[styles.copyBtnTxt, { color: "#22c55e" }]}>WhatsApp</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── ABA LOGS ── */}
        {activeTab === "logs" && (
          <>
            {/* Header */}
            <View style={[styles.sectionHeader, { marginTop: 16 }]}>
              <Text style={[styles.sectionLabel, { color: "#e879f9" }]}>LOGS DO APLICATIVO</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => {
                    setLogsLoading(true);
                    setLogsData([]);
                    fetch(`${getApiBase()}/app-logs?limit=300`, { signal: mkSignal(10000) })
                      .then((r) => r.json())
                      .then((d) => { if (d.logs) setLogsData(d.logs); })
                      .catch(() => {})
                      .finally(() => setLogsLoading(false));
                  }}
                  style={[styles.refreshBtn, { backgroundColor: "#e879f915" }]}
                >
                  <Feather name="refresh-cw" size={12} color="#e879f9" />
                  <Text style={[styles.refreshText, { color: "#e879f9" }]}>Atualizar</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const filtered = logsFilter === "all" ? logsData : logsData.filter((l) => l.level === logsFilter);
                    if (filtered.length === 0) return;
                    const text = filtered.map((l) => {
                      const ts = new Date(l.createdAt).toLocaleString("pt-BR");
                      const det = l.details ? `\n  detalhes: ${JSON.stringify(l.details)}` : "";
                      const dev = l.device ? ` [${l.device}]` : "";
                      return `[${ts}]${dev} ${l.level.toUpperCase()} (${l.category}): ${l.message}${det}`;
                    }).join("\n\n");
                    Clipboard.setString(text);
                    Alert.alert("Copiado!", `${filtered.length} log(s) copiados para o clipboard.`);
                  }}
                  style={[styles.refreshBtn, { backgroundColor: "#3b82f615" }]}
                >
                  <Feather name="copy" size={12} color="#3b82f6" />
                  <Text style={[styles.refreshText, { color: "#3b82f6" }]}>Copiar Tudo</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert("Limpar Logs", "Remover todos os logs do banco?", [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Limpar",
                        style: "destructive",
                        onPress: () => {
                          fetch(`${getApiBase()}/app-logs`, { method: "DELETE", signal: mkSignal(8000) })
                            .then(() => setLogsData([]))
                            .catch(() => {});
                        },
                      },
                    ]);
                  }}
                  style={[styles.refreshBtn, { backgroundColor: "#ef444415" }]}
                >
                  <Feather name="trash-2" size={12} color="#ef4444" />
                  <Text style={[styles.refreshText, { color: "#ef4444" }]}>Limpar</Text>
                </Pressable>
              </View>
            </View>

            {/* Info box */}
            <View style={[styles.infoBox, { backgroundColor: "#e879f90a", borderColor: "#e879f920", marginBottom: 12 }]}>
              <Feather name="info" size={14} color="#e879f9" />
              <Text style={[styles.infoBoxText, { color: colors.mutedForeground, flex: 1 }]}>
                Erros do player Flix 2.0, falhas de API e eventos do app aparecem aqui. Pressione "Copiar Tudo" e cole para diagnóstico.
              </Text>
            </View>

            {/* Filter pills */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {(["all", "error", "warn", "info"] as const).map((f) => {
                const fColor = f === "error" ? "#ef4444" : f === "warn" ? "#f59e0b" : f === "info" ? "#3b82f6" : "#e879f9";
                const isActive = logsFilter === f;
                const count = f === "all" ? logsData.length : logsData.filter((l) => l.level === f).length;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setLogsFilter(f)}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 5,
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                      borderWidth: 1,
                      borderColor: isActive ? fColor : colors.border,
                      backgroundColor: isActive ? fColor + "20" : "transparent",
                    }}
                  >
                    <Text style={{ color: isActive ? fColor : colors.mutedForeground, fontSize: 12, fontWeight: "700" }}>
                      {f === "all" ? "Todos" : f === "error" ? "Erros" : f === "warn" ? "Avisos" : "Info"}
                    </Text>
                    <View style={{ backgroundColor: isActive ? fColor : colors.border, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ color: isActive ? "#fff" : colors.mutedForeground, fontSize: 10, fontWeight: "700" }}>{count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Log list */}
            {logsLoading ? (
              <View style={[styles.centered, { paddingVertical: 40 }]}>
                <ActivityIndicator color="#e879f9" />
                <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Carregando logs...</Text>
              </View>
            ) : logsData.filter((l) => logsFilter === "all" || l.level === logsFilter).length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Feather name="terminal" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Nenhum log encontrado</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", paddingHorizontal: 16 }}>
                  Logs aparecem automaticamente quando o app encontrar erros ou eventos importantes.
                </Text>
              </View>
            ) : (
              logsData
                .filter((l) => logsFilter === "all" || l.level === logsFilter)
                .map((log) => {
                  const levelColor = log.level === "error" ? "#ef4444" : log.level === "warn" ? "#f59e0b" : "#3b82f6";
                  const levelBg = log.level === "error" ? "#ef444415" : log.level === "warn" ? "#f59e0b15" : "#3b82f615";
                  const isExp = logsExpanded.has(log.id);
                  const ts = new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  const hasDetails = !!log.details;
                  return (
                    <Pressable
                      key={log.id}
                      onPress={() => {
                        if (!hasDetails) return;
                        setLogsExpanded((prev) => {
                          const n = new Set(prev);
                          if (n.has(log.id)) n.delete(log.id); else n.add(log.id);
                          return n;
                        });
                      }}
                      style={{
                        backgroundColor: colors.card,
                        borderColor: isExp ? levelColor + "55" : colors.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                        borderLeftWidth: 3,
                        borderLeftColor: levelColor,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                        <View style={{ backgroundColor: levelBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 1 }}>
                          <Text style={{ color: levelColor, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>{log.level}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{log.category}</Text>
                            <Text style={{ color: colors.border, fontSize: 10 }}>·</Text>
                            <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{ts}</Text>
                            {log.device && (
                              <>
                                <Text style={{ color: colors.border, fontSize: 10 }}>·</Text>
                                <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{log.device}</Text>
                              </>
                            )}
                          </View>
                          <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 18 }}>{log.message}</Text>
                          {isExp && hasDetails && (
                            <View style={{ marginTop: 8, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 10 }}>
                              <Text style={{ color: "#a3e635", fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 17 }}>
                                {JSON.stringify(log.details, null, 2)}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                          {hasDetails && (
                            <Feather name={isExp ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                          )}
                          <Pressable
                            onPress={() => {
                              const det = log.details ? `\nDetalhes: ${JSON.stringify(log.details)}` : "";
                              Clipboard.setString(`[${ts}] ${log.level.toUpperCase()} (${log.category}): ${log.message}${det}`);
                            }}
                          >
                            <Feather name="copy" size={14} color={colors.mutedForeground} />
                          </Pressable>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
            )}
          </>
        )}
        {/* ── TERABOX TAB ── */}
        {activeTab === "terabox" && (
          <>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderColor: "#06b6d430", backgroundColor: "#06b6d415", padding: 14, marginTop: 16, marginBottom: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#06b6d418", alignItems: "center", justifyContent: "center" }}>
                <Feather name="box" size={22} color="#06b6d4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", letterSpacing: 0.3, color: colors.foreground }}>Terabox</Text>
                <Text style={{ fontSize: 12, marginTop: 2, color: colors.mutedForeground }}>Explorar pastas e testar reprodução de vídeos</Text>
              </View>
            </View>

            {/* URL input */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>URL DO COMPARTILHAMENTO TERABOX</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[{ flex: 1, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 12 }, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="https://www.terabox.app/wap/share/filelist?surl=..."
                placeholderTextColor={colors.mutedForeground}
                value={tbInputUrl}
                onChangeText={setTbInputUrl}
                autoCapitalize="none"
                autoCorrect={false}
                multiline={false}
              />
              <Pressable
                onPress={() => {
                  const parsed = parseTbSurl(tbInputUrl);
                  if (!parsed) { setTbError("URL inválida. Use o link de compartilhamento do Terabox."); return; }
                  setTbSurl(parsed.surl);
                  setTbCurrentPath(parsed.path);
                  setTbBreadcrumb([]);
                  loadTbFiles(parsed.surl, parsed.path);
                }}
                style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: "#06b6d4", alignItems: "center", justifyContent: "center" }}
              >
                <Feather name="search" size={18} color="#fff" />
              </Pressable>
            </View>

            {/* Info banner */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", borderRadius: 10, borderWidth: 1, borderColor: "#06b6d430", backgroundColor: "#06b6d412", padding: 12, gap: 8, marginBottom: 14 }}>
              <Feather name="info" size={14} color="#06b6d4" />
              <Text style={{ fontSize: 12, lineHeight: 17, flex: 1, color: colors.mutedForeground }}>
                Cola o link de compartilhamento. Os arquivos serão listados via API do Terabox. Toque em <Text style={{ color: "#06b6d4", fontWeight: "700" }}>▶ Play</Text> num vídeo para testar a reprodução.
              </Text>
            </View>

            {/* Breadcrumb */}
            {tbSurl !== "" && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Pressable onPress={() => tbNavigateTo(tbSurl, tbCurrentPath.split("/").slice(0, 2).join("/") || "/", 0)}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#06b6d4" }}>Raiz</Text>
                  </Pressable>
                  {tbBreadcrumb.map((crumb, i) => (
                    <React.Fragment key={i}>
                      <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
                      <Pressable onPress={() => tbNavigateTo(tbSurl, crumb.path, i + 1)}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: i === tbBreadcrumb.length - 1 ? colors.foreground : "#06b6d4" }} numberOfLines={1}>{crumb.label}</Text>
                      </Pressable>
                    </React.Fragment>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Loading */}
            {tbLoading && (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
                <ActivityIndicator size="large" color="#06b6d4" />
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Carregando arquivos do Terabox…</Text>
              </View>
            )}

            {/* Error */}
            {!tbLoading && tbError && (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#ef444440", backgroundColor: "#ef444410", padding: 16, marginBottom: 12, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Feather name="alert-circle" size={16} color="#ef4444" />
                <Text style={{ fontSize: 13, color: "#ef4444", flex: 1, lineHeight: 19 }}>{tbError}</Text>
              </View>
            )}

            {/* File list */}
            {!tbLoading && tbFiles.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>
                  {tbFiles.length} ARQUIVO{tbFiles.length !== 1 ? "S" : ""} ENCONTRADO{tbFiles.length !== 1 ? "S" : ""}
                </Text>
                {tbFiles.map((file) => {
                  const isDir = file.isdir === 1;
                  const isVid = isTbVideo(file);
                  return (
                    <View
                      key={file.fs_id || file.path}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 10, marginBottom: 8 }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: isDir ? "#06b6d418" : isVid ? "#e5091415" : "#ffffff08", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={isDir ? "folder" : isVid ? "film" : "file"} size={18} color={isDir ? "#06b6d4" : isVid ? RED : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={2}>{file.server_filename}</Text>
                        {!isDir && <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>{tbFormatSize(file.size)}</Text>}
                      </View>
                      {isDir ? (
                        <Pressable
                          onPress={() => openTbFolder(tbSurl, file)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#06b6d420", flexDirection: "row", alignItems: "center", gap: 5 }}
                        >
                          <Feather name="folder-open" size={13} color="#06b6d4" />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#06b6d4" }}>Abrir</Text>
                        </Pressable>
                      ) : isVid ? (
                        <Pressable
                          onPress={() => playTbFile(tbSurl, file)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: RED + "20", flexDirection: "row", alignItems: "center", gap: 5 }}
                        >
                          <Feather name="play" size={13} color={RED} />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: RED }}>Play</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </>
            )}

            {/* Empty state */}
            {!tbLoading && !tbError && tbFiles.length === 0 && tbSurl === "" && (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 32, alignItems: "center", gap: 12, marginTop: 8 }}>
                <Feather name="box" size={36} color={colors.mutedForeground} />
                <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
                  Cole o link de compartilhamento do Terabox acima e toque na lupa para listar os arquivos.
                </Text>
              </View>
            )}
          </>
        )}

      </ScrollView>

      {/* ── Terabox Resolver (hidden WebView to extract direct URL) ── */}
      <TeraboxWebViewResolver
        teraboxUrl={tbResolverUrl}
        visible={tbResolverVisible}
        onResolved={(url) => {
          setTbResolverVisible(false);
          setTbPlayerUrl(url);
          setTbPlayerVisible(true);
        }}
        onError={(msg) => {
          setTbResolverVisible(false);
          Alert.alert("Terabox", `Não foi possível obter a URL do vídeo.\n\n${msg}\n\nTente abrir o link manualmente.`);
        }}
        onCancel={() => setTbResolverVisible(false)}
      />

      {/* ── Terabox Player Modal ── */}
      <Modal
        visible={tbPlayerVisible}
        animationType="slide"
        onRequestClose={() => setTbPlayerVisible(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={[gs.playerHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => setTbPlayerVisible(false)} style={gs.playerClose}>
              <Feather name="x" size={22} color="#fff" />
            </Pressable>
            <Text style={gs.playerTitle} numberOfLines={1}>{tbPlayerTitle}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#06b6d420", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#06b6d4" }} />
              <Text style={{ color: "#06b6d4", fontSize: 11, fontWeight: "700" }}>Terabox</Text>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            {Platform.OS === "web" ? (
              <iframe
                src={tbPlayerUrl}
                style={{ flex: 1, width: "100%", height: "100%", border: "none", backgroundColor: "#000" } as any}
                allowFullScreen
              />
            ) : WebView ? (
              <WebView
                source={{ uri: tbPlayerUrl }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="always"
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                <Feather name="alert-circle" size={40} color="#06b6d4" />
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>WebView indisponível</Text>
                <Text style={{ color: "#888", fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>
                  Instale o app nativo para reproduzir via WebView.
                </Text>
              </View>
            )}
          </View>

          <View style={[gs.playerUrlBar, { paddingBottom: insets.bottom + 8, backgroundColor: "#0a0a0a" }]}>
            <Text style={[gs.playerUrlTxt, { color: "#06b6d4", flex: 1 }]} numberOfLines={1}>{tbPlayerUrl}</Text>
            <Pressable onPress={() => copyText(tbPlayerUrl)}>
              <Feather name="copy" size={14} color="#06b6d4" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── WarezCDN Player Modal (Sandbox) ── */}
      <Modal
        visible={wPlayerVisible}
        animationType="slide"
        onRequestClose={() => setWPlayerVisible(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={[gs.playerHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => setWPlayerVisible(false)} style={gs.playerClose}>
              <Feather name="x" size={22} color="#fff" />
            </Pressable>
            <Text style={gs.playerTitle} numberOfLines={1}>{wPlayerTitle}</Text>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f9731620", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#f97316" }} />
                <Text style={{ color: "#f97316", fontSize: 11, fontWeight: "700" }}>WarezCDN</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22c55e20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Feather name="shield" size={11} color="#22c55e" />
                <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "700" }}>AD BLOCK</Text>
              </View>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            {Platform.OS === "web" ? (
              <iframe
                src={wPlayerUrl}
                style={{ width: "100%", height: "100%", border: "none" } as any}
                allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *; clipboard-write *; accelerometer *; gyroscope *; web-share *"
                allowFullScreen
              />
            ) : WebView ? (
              <WebView
                source={{
                  html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0"><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;background:#000;overflow:hidden;}iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:none;}</style></head><body><iframe src="${wPlayerUrl}" width="100%" height="100%" frameborder="0" scrolling="no" allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *; clipboard-write *; accelerometer *; gyroscope *; web-share *" allowfullscreen webkitallowfullscreen mozallowfullscreen></iframe></body></html>`,
                  baseUrl: "https://warezcdn.lat",
                }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="always"
                injectedJavaScript={WAREZ_ADBLOCK_JS}
                onShouldStartLoadWithRequest={(req) => {
                  const BLOCKED = ["googlesyndication","adservice.google","doubleclick.net","googletagmanager","hotmart","moatads","outbrain","taboola","propellerads","popcash","exoclick","trafficjunky","adnxs","rubiconproject","openx","pubmatic","appnexus","popads","juicyads","adcash","ad-maven"];
                  const url = req.url ?? "";
                  if (BLOCKED.some(d => url.includes(d))) return false;
                  return true;
                }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                <Feather name="alert-circle" size={40} color="#f97316" />
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>WebView indisponível</Text>
                <Text style={{ color: "#888", fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>
                  Instale o app nativo para reproduzir via WebView.
                </Text>
              </View>
            )}
          </View>

          <View style={[gs.playerUrlBar, { paddingBottom: insets.bottom + 8, backgroundColor: "#0a0a0a" }]}>
            <Text style={[gs.playerUrlTxt, { color: "#f97316" }]} numberOfLines={1}>{wPlayerUrl}</Text>
            <Pressable onPress={() => copyText(wPlayerUrl)}>
              <Feather name="copy" size={14} color="#f97316" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── GStream Player Modal ── */}
      <Modal
        visible={gPlayerVisible}
        animationType="slide"
        onRequestClose={() => setGPlayerVisible(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {/* Header */}
          <View style={[gs.playerHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => setGPlayerVisible(false)} style={gs.playerClose}>
              <Feather name="x" size={22} color="#fff" />
            </Pressable>
            <Text style={gs.playerTitle} numberOfLines={1}>{gPlayerTitle}</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#6366f1" }} />
              <Text style={{ color: "#6366f1", fontSize: 11, fontWeight: "700" }}>GStream</Text>
            </View>
          </View>

          {/* Player area */}
          <View style={{ flex: 1 }}>
            {Platform.OS === "web" ? (
              <iframe
                src={gPlayerUrl}
                style={{ width: "100%", height: "100%", border: "none" } as any}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            ) : WebView ? (
              <WebView
                source={{ uri: gPlayerUrl }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="always"
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                <Feather name="alert-circle" size={40} color="#6366f1" />
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>WebView indisponível</Text>
                <Text style={{ color: "#888", fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>
                  Instale o app nativo para reproduzir via WebView.
                </Text>
              </View>
            )}
          </View>

          {/* URL bar */}
          <View style={[gs.playerUrlBar, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={gs.playerUrlTxt} numberOfLines={1}>{gPlayerUrl}</Text>
            <Pressable onPress={() => copyText(gPlayerUrl)}>
              <Feather name="copy" size={14} color="#6366f1" />
            </Pressable>
          </View>
        </View>
      </Modal>
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

const gs = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 16, marginBottom: 4 },
  headerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#6366f118", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  headerSub: { fontSize: 12, marginTop: 2 },
  subTab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  subTabTxt: { fontSize: 12, fontWeight: "700" },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  checkBtn: { width: 46, height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  resultCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16 },
  resultTitle: { fontSize: 15, fontWeight: "700" },
  resultUrl: { fontSize: 11, marginTop: 4 },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  playBtnTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  infoTxt: { fontSize: 12, lineHeight: 17, flex: 1 },
  apiEndpoint: { borderRadius: 14, borderWidth: 1, padding: 14 },
  methodBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  methodTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  endpointRow: { flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 8, marginTop: 6 },
  endpointTxt: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  playerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#000" },
  playerClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  playerTitle: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center", marginHorizontal: 8 },
  playerUrlBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: "#111" },
  playerUrlTxt: { flex: 1, color: "#6366f1", fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  verifyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16 },
  verifyBtnTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

const wz = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 16, marginBottom: 4 },
  headerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#f9731618", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  headerSub: { fontSize: 12, marginTop: 2 },
  subTab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  subTabTxt: { fontSize: 12, fontWeight: "700" },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  infoTxt: { fontSize: 12, lineHeight: 17, flex: 1 },
  typeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingVertical: 12 },
  typeBtnTxt: { fontSize: 14, fontWeight: "700" },
  urlPreview: { borderRadius: 10, borderWidth: 1, padding: 12 },
  urlLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: 4 },
  urlText: { fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16 },
  playBtnTxt: { fontSize: 14, fontWeight: "700" },
  endpointCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  endpointBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  endpointMethod: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  catBtn: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  catBtnTxt: { fontSize: 12, fontWeight: "700" },
  searchBtn: { width: 46, height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8 },
  poster: { width: 42, height: 60, borderRadius: 6 },
  posterPlaceholder: { width: 42, height: 60, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  resultId: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  resultTitle: { fontSize: 13, fontWeight: "600" },
  channelRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8 },
  channelLogo: { width: 52, height: 36, borderRadius: 6 },
  channelLogoPlaceholder: { width: 52, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  channelName: { fontSize: 14, fontWeight: "700" },
  playSmall: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  eventCard: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  eventCover: { width: "100%", height: 80 },
  teamLogo: { width: 36, height: 36, borderRadius: 4 },
});

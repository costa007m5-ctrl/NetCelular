import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import {
  getNotificationsEnabled,
  requestPermissionsAndSetup,
  scheduleNewContentNotification,
  sendTestNotification,
  setNotificationsEnabled,
} from "@/lib/notifications";

const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";
const RED = "#e50914";

interface RowProps {
  icon: string;
  label: string;
  value?: string;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
  accent?: boolean;
  iconBg?: string;
  iconColor?: string;
  badge?: string;
  badgeColor?: string;
}

function Row({
  icon, label, value, toggle, toggleValue, onToggle, onPress,
  danger, accent, iconBg, iconColor, badge, badgeColor,
}: RowProps) {
  const colors = useColors();
  const fg = danger ? RED : colors.foreground;
  const ic = iconColor ?? (danger ? RED : accent ? RED : colors.mutedForeground);
  const bg = iconBg ?? ((danger || accent) ? RED + "22" : colors.card);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [sRow.row, { backgroundColor: pressed && onPress ? colors.card : "transparent" }]}
    >
      <View style={[sRow.icon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={16} color={ic} />
      </View>
      <Text style={[sRow.label, { color: fg }]}>{label}</Text>
      <View style={sRow.right}>
        {badge && (
          <View style={[sRow.badge, { backgroundColor: (badgeColor ?? RED) + "22" }]}>
            <Text style={[sRow.badgeTxt, { color: badgeColor ?? RED }]}>{badge}</Text>
          </View>
        )}
        {value && <Text style={[sRow.value, { color: colors.mutedForeground }]}>{value}</Text>}
        {toggle && onToggle ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            trackColor={{ false: colors.border, true: RED }}
            thumbColor="#fff"
          />
        ) : !toggle ? (
          <Feather name="chevron-right" size={16} color={colors.border} />
        ) : null}
      </View>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={sRow.section}>
      <Text style={[sRow.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[sRow.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Sep() {
  const colors = useColors();
  return <View style={[sRow.sep, { backgroundColor: colors.border }]} />;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [notifPush, setNotifPush] = useState(true);
  const [notifLancamentos, setNotifLancamentos] = useState(true);
  const [notifContinue, setNotifContinue] = useState(false);
  const [notifPromo, setNotifPromo] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [pip, setPip] = useState(false);
  const [hd, setHd] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [smartDownload, setSmartDownload] = useState(true);
  const [parentalControl, setParentalControl] = useState(false);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [streamQuality, setStreamQuality] = useState("Auto");
  const [audioLang, setAudioLang] = useState("Português");
  const [subtitleLang, setSubtitleLang] = useState("Português");
  const [contentRating, setContentRating] = useState("16+");

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_PROFILE_KEY)
      .then((raw) => { if (raw) setActiveProfile(JSON.parse(raw)); })
      .catch(() => {});
    getNotificationsEnabled().then(setNotifPush);
  }, [user?.id]);

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout();
      router.replace("/login");
      return;
    }
    Alert.alert("Sair da conta", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair", style: "destructive",
        onPress: async () => { await logout(); router.replace("/login"); },
      },
    ]);
  };

  const handleNotifToggle = async (v: boolean) => {
    setNotifPush(v);
    await setNotificationsEnabled(v);
    if (v) {
      const granted = await requestPermissionsAndSetup();
      if (granted) {
        await scheduleNewContentNotification();
        await sendTestNotification();
      } else {
        Alert.alert(
          "Permissão necessária",
          "Ative as notificações nas configurações do celular para receber novidades.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir Configurações", onPress: () => Linking.openSettings() },
          ]
        );
        setNotifPush(false);
      }
    }
  };

  const handleClearCache = () => {
    Alert.alert("Limpar Cache", "Isso vai limpar dados temporários do app.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Limpar", style: "destructive", onPress: () => Alert.alert("Cache limpo!", "Dados temporários removidos.") },
    ]);
  };

  const handleClearHistory = () => {
    Alert.alert("Limpar Histórico", "Seu histórico de visualização será excluído permanentemente.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Limpar", style: "destructive", onPress: () => Alert.alert("Histórico limpo!") },
    ]);
  };

  const handleInvite = () => {
    Alert.alert("Convidar Amigos", "Compartilhe o NETPLAY e ganhe 1 mês grátis por cada amigo que assinar!");
  };

  const handleRate = () => {
    Alert.alert("Avaliar o NETPLAY", "Obrigado! Seu feedback nos ajuda a melhorar.", [
      { text: "★★★★★ Excelente!" },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const isAdmin = user?.role === "admin";
  const profileName = activeProfile?.name ?? user?.name ?? "Usuário NETPLAY";
  const profileInitial = profileName[0]?.toUpperCase() ?? "N";

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: topPad + 10 }} />

        <View style={s.heroSection}>
          <LinearGradient
            colors={["rgba(229,9,20,0.12)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.avatarSection}>
            {activeProfile?.avatarUrl ? (
              <Image
                source={{ uri: activeProfile.avatarUrl }}
                style={s.avatar}
                contentFit="cover"
              />
            ) : (
              <LinearGradient colors={[RED, "#7a0000"]} style={s.avatar}>
                <Text style={s.avatarText}>{profileInitial}</Text>
              </LinearGradient>
            )}
            <View style={s.editAvatarBadge}>
              <Feather name="edit-2" size={10} color="#fff" />
            </View>
          </View>
          <Text style={[s.userName, { color: colors.foreground }]}>{profileName}</Text>
          <Text style={[s.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user?.email ?? ""}
          </Text>
          <View style={s.badgeRow}>
            <View style={s.premiumBadge}>
              <LinearGradient colors={[RED, "#8b0000"]} style={StyleSheet.absoluteFill} />
              <Feather name="star" size={11} color="#fff" />
              <Text style={s.premiumText}>PREMIUM</Text>
            </View>
            {isAdmin && (
              <View style={[s.adminBadge]}>
                <Feather name="shield" size={11} color="#ff9800" />
                <Text style={s.adminText}>ADMIN</Text>
              </View>
            )}
          </View>

          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statNumber}>47</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Assistidos</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <View style={s.statItem}>
              <Text style={s.statNumber}>12</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Na lista</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <View style={s.statItem}>
              <Text style={s.statNumber}>3</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Downloads</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <View style={s.statItem}>
              <Text style={s.statNumber}>89h</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Tempo total</Text>
            </View>
          </View>
        </View>

        <Section title="MINHA CONTA">
          <Row icon="user" label="Informações Pessoais" onPress={() => Alert.alert("Em breve", "Edição de perfil disponível em breve.")} />
          <Sep />
          <Row icon="lock" label="Alterar Senha" onPress={() => Alert.alert("Em breve")} />
          <Sep />
          <Row icon="credit-card" label="Plano Premium" value="R$ 39,90/mês" onPress={() => Alert.alert("Plano Premium", "Próxima cobrança: 28/06/2026")} accent />
          <Sep />
          <Row icon="monitor" label="Dispositivos Conectados" value="2 de 3" onPress={() => Alert.alert("Dispositivos", "• iPhone 15 Pro (ativo)\n• Smart TV Samsung\n\nToque para gerenciar.")} />
          <Sep />
          <Row icon="clock" label="Histórico de Pagamentos" onPress={() => Alert.alert("Histórico", "Maio/2026 — R$ 39,90 ✓\nAbr/2026 — R$ 39,90 ✓\nMar/2026 — R$ 39,90 ✓")} />
        </Section>

        <Section title="VISUALIZAÇÃO">
          <Row icon="play-circle" label="Reprodução Automática" toggle toggleValue={autoPlay} onToggle={setAutoPlay} iconBg="#1d4ed822" iconColor="#3b82f6" />
          <Sep />
          <Row
            icon="film"
            label="Qualidade de Streaming"
            value={streamQuality}
            onPress={() =>
              Alert.alert("Qualidade", "Escolha a qualidade de streaming:", [
                { text: "Auto", onPress: () => setStreamQuality("Auto") },
                { text: "HD (720p)", onPress: () => setStreamQuality("HD") },
                { text: "Full HD (1080p)", onPress: () => setStreamQuality("FHD") },
                { text: "4K Ultra HD", onPress: () => setStreamQuality("4K") },
                { text: "Cancelar", style: "cancel" },
              ])
            }
            iconBg="#7c3aed22"
            iconColor="#a78bfa"
          />
          <Sep />
          <Row
            icon="volume-2"
            label="Idioma de Áudio"
            value={audioLang}
            onPress={() =>
              Alert.alert("Idioma de Áudio", "", [
                { text: "Português (BR)", onPress: () => setAudioLang("Português") },
                { text: "English", onPress: () => setAudioLang("English") },
                { text: "Español", onPress: () => setAudioLang("Español") },
                { text: "Cancelar", style: "cancel" },
              ])
            }
            iconBg="#059669"
            iconColor="#34d399"
          />
          <Sep />
          <Row
            icon="message-square"
            label="Idioma de Legenda"
            value={subtitleLang}
            onPress={() =>
              Alert.alert("Legenda", "", [
                { text: "Português (BR)", onPress: () => setSubtitleLang("Português") },
                { text: "English", onPress: () => setSubtitleLang("English") },
                { text: "Desativado", onPress: () => setSubtitleLang("Off") },
                { text: "Cancelar", style: "cancel" },
              ])
            }
            iconBg="#d9770622"
            iconColor="#f59e0b"
          />
          <Sep />
          <Row icon="minimize-2" label="Picture-in-Picture" toggle toggleValue={pip} onToggle={setPip} iconBg="#ec489922" iconColor="#f472b6" />
        </Section>

        <Section title="NOTIFICAÇÕES">
          <Row
            icon="bell"
            label="Notificações Push"
            toggle
            toggleValue={notifPush}
            onToggle={handleNotifToggle}
            iconBg="#e5091422"
            iconColor={RED}
          />
          <Sep />
          <Row icon="star" label="Novos Lançamentos" toggle toggleValue={notifLancamentos} onToggle={setNotifLancamentos} iconBg="#f59e0b22" iconColor="#f59e0b" />
          <Sep />
          <Row icon="play-circle" label="Continue Assistindo" toggle toggleValue={notifContinue} onToggle={setNotifContinue} iconBg="#3b82f622" iconColor="#3b82f6" />
          <Sep />
          <Row icon="tag" label="Promoções e Ofertas" toggle toggleValue={notifPromo} onToggle={setNotifPromo} iconBg="#22c55e22" iconColor="#22c55e" />
        </Section>

        <Section title="PRIVACIDADE & CONTROLE">
          <Row icon="shield" label="Controle Parental" toggle toggleValue={parentalControl} onToggle={setParentalControl} iconBg="#7c3aed22" iconColor="#a78bfa" />
          <Sep />
          <Row
            icon="alert-circle"
            label="Classificação de Conteúdo"
            value={contentRating}
            onPress={() =>
              Alert.alert("Classificação Indicativa", "", [
                { text: "Livre", onPress: () => setContentRating("Livre") },
                { text: "12+", onPress: () => setContentRating("12+") },
                { text: "16+", onPress: () => setContentRating("16+") },
                { text: "18+", onPress: () => setContentRating("18+") },
                { text: "Cancelar", style: "cancel" },
              ])
            }
            iconBg="#f59e0b22"
            iconColor="#f59e0b"
          />
          <Sep />
          <Row icon="eye" label="Histórico de Visualização" onPress={() => Alert.alert("Histórico", "Exibindo os últimos 47 títulos assistidos.")} />
          <Sep />
          <Row icon="trash-2" label="Limpar Histórico" onPress={handleClearHistory} danger />
        </Section>

        <Section title="ARMAZENAMENTO & DOWNLOADS">
          <Row icon="download" label="Downloads Offline" value="3 itens · 4.0 GB" onPress={() => router.push("/(tabs)/downloads")} iconBg="#06b6d422" iconColor="#06b6d4" />
          <Sep />
          <Row icon="wifi" label="Somente via Wi-Fi" toggle toggleValue={wifiOnly} onToggle={setWifiOnly} iconBg="#3b82f622" iconColor="#3b82f6" />
          <Sep />
          <Row icon="zap" label="Download Inteligente" toggle toggleValue={smartDownload} onToggle={setSmartDownload} iconBg="#22c55e22" iconColor="#22c55e" />
          <Sep />
          <Row icon="hard-drive" label="Limpar Cache" value="128 MB" onPress={handleClearCache} iconBg="#64748b22" iconColor="#94a3b8" />
        </Section>

        <Section title="SOCIAL">
          <Row icon="share-2" label="Compartilhar Perfil" onPress={() => Alert.alert("Compartilhar", "Compartilhe seu perfil NETPLAY com amigos!")} iconBg="#06b6d422" iconColor="#06b6d4" />
          <Sep />
          <Row icon="user-plus" label="Convidar Amigos" badge="+1 mês grátis" badgeColor="#22c55e" onPress={handleInvite} iconBg="#22c55e22" iconColor="#22c55e" />
          <Sep />
          <Row icon="star" label="Avaliar o NETPLAY" onPress={handleRate} iconBg="#f59e0b22" iconColor="#f59e0b" />
        </Section>

        <Section title="SUPORTE">
          <Row icon="help-circle" label="Central de Ajuda" onPress={() => Alert.alert("Ajuda", "Acesse help.netplay.com.br para suporte completo.")} />
          <Sep />
          <Row icon="alert-triangle" label="Reportar Problema" onPress={() => Alert.alert("Reportar", "Descreva o problema para nossa equipe técnica.")} />
          <Sep />
          <Row icon="gift" label="Novidades da Versão v1.0.0" onPress={() => Alert.alert("v1.0.0", "• Notificações push\n• Tela Descobrir\n• Downloads offline\n• Avatar com filmes e séries\n• 25+ novas funcionalidades")} />
        </Section>

        <Section title="SOBRE">
          <Row icon="file-text" label="Termos de Uso" onPress={() => Alert.alert("Termos de Uso", "Acesse termos.netplay.com.br")} />
          <Sep />
          <Row icon="lock" label="Política de Privacidade" onPress={() => Alert.alert("Privacidade", "Acesse privacidade.netplay.com.br")} />
          <Sep />
          <Row icon="package" label="Licenças Open Source" onPress={() => Alert.alert("Licenças", "Este app utiliza software de código aberto.")} />
          <Sep />
          <Row icon="info" label="Sobre o NETPLAY" value="v1.0.0" onPress={() => Alert.alert("NETPLAY", "Catálogo Premium de Entretenimento\nPowered by TMDB API")} />
        </Section>

        {isAdmin && (
          <Section title="ADMINISTRAÇÃO">
            <Row icon="activity" label="Painel Admin" accent onPress={() => router.push("/admin")} />
          </Section>
        )}

        <Section title="PERFIS">
          <Row icon="users" label="Trocar Perfil" accent onPress={() => router.push("/profile-select")} />
        </Section>

        <Section title="">
          <Row icon="log-out" label="Sair da conta" danger onPress={handleLogout} />
        </Section>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  heroSection: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
    overflow: "hidden",
  },
  avatarSection: { position: "relative", marginBottom: 14 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: RED,
  },
  editAvatarBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  userName: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  userEmail: { fontSize: 13, marginBottom: 12 },
  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  premiumBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, overflow: "hidden",
  },
  premiumText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  adminBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, backgroundColor: "#ff980022",
    borderWidth: 1, borderColor: "#ff980044",
  },
  adminText: { color: "#ff9800", fontSize: 11, fontWeight: "800" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: "100%",
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statNumber: { color: "#fff", fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "600" },
  statDivider: { width: 1, height: 32 },
});

const sRow = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1,
    marginBottom: 10, textTransform: "uppercase",
  },
  sectionCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 15, fontWeight: "500" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeTxt: { fontSize: 10, fontWeight: "700" },
  sep: { height: 1, marginLeft: 62 },
});

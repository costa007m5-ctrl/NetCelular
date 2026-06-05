import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
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
import { supabase, db, isSupabaseConfigured, type DbUserSettings } from "@/lib/supabase";
import { useTheme } from "@/lib/theme-context";
import {
  getSettings,
  saveSettings,
  updateSetting,
  type UserSettings,
  DEFAULT_SETTINGS,
} from "@/lib/user-settings";
import {
  getNotificationsEnabled,
  registerPushToken,
  requestPermissionsAndSetup,
  setNotificationsEnabled,
} from "@/lib/notifications";
import type { WatchlistItem } from "@/lib/supabase";
import {
  analyzeWatchHistory,
  clearLearnedPreferences,
  getLearnedPreferences,
  getMergedPreferences,
  saveManualPreferences,
  type LearnedPreferences,
  type ManualPreferences,
} from "@/lib/smart-preferences";

const { width: SW } = Dimensions.get("window");
const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";
const BANNER_KEY = "netplay_profile_banner";
const RED = "#e50914";

const SETTING_TO_DB: Partial<Record<keyof UserSettings, keyof DbUserSettings>> = {
  parentalControl: "parental_control",
  contentRating: "content_rating",
  streamQuality: "stream_quality",
  audioLang: "audio_lang",
  subtitleLang: "subtitle_lang",
  autoPlay: "auto_play",
  pip: "pip",
  notifPush: "notif_push",
  notifLancamentos: "notif_lancamentos",
  notifContinue: "notif_continue",
  notifPromo: "notif_promo",
  wifiOnly: "wifi_only",
  smartDownload: "smart_download",
  downloadQuality: "download_quality",
  theme: "theme",
};
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const QUALITY_OPTIONS = ["Auto", "Baixa (360p)", "Média (480p)", "Boa (720p)", "Alta (1080p)", "Ultra (4K)"];
const AUDIO_OPTIONS = ["Português (BR)", "Inglês", "Espanhol", "Francês", "Alemão", "Italiano", "Japonês"];
const SUBTITLE_OPTIONS = ["Desativado", "Português (BR)", "Inglês", "Espanhol", "Francês", "Alemão"];
const CONTENT_RATING_OPTIONS = ["Livre", "10+", "12+", "14+", "16+", "18+"];
const DOWNLOAD_QUALITY_OPTIONS = ["Baixa (360p)", "Boa (720p)", "Alta (1080p)"];

function Row({
  icon, label, value, toggle, toggleValue, onToggle, onPress,
  danger, accent, iconBg, iconColor, badge, badgeColor, last,
}: {
  icon: string; label: string; value?: string; toggle?: boolean;
  toggleValue?: boolean; onToggle?: (v: boolean) => void; onPress?: () => void;
  danger?: boolean; accent?: boolean; iconBg?: string; iconColor?: string;
  badge?: string; badgeColor?: string; last?: boolean;
}) {
  const colors = useColors();
  const fg = danger ? RED : colors.foreground;
  const ic = iconColor ?? (danger ? RED : accent ? RED : colors.mutedForeground);
  const bg = iconBg ?? ((danger || accent) ? `${RED}22` : colors.border + "40");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, { borderBottomColor: last ? "transparent" : colors.border + "50", backgroundColor: pressed && onPress ? colors.border + "30" : "transparent" }]}
    >
      <View style={[s.rowIcon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={15} color={ic} />
      </View>
      <Text style={[s.rowLabel, { color: fg }]}>{label}</Text>
      <View style={s.rowRight}>
        {badge && (
          <View style={[s.badge, { backgroundColor: (badgeColor ?? RED) + "22" }]}>
            <Text style={[s.badgeTxt, { color: badgeColor ?? RED }]}>{badge}</Text>
          </View>
        )}
        {value && <Text style={[s.rowValue, { color: colors.mutedForeground }]}>{value}</Text>}
        {toggle && onToggle ? (
          <Switch value={toggleValue} onValueChange={onToggle} trackColor={{ false: colors.border, true: RED }} thumbColor="#fff" />
        ) : !toggle ? (
          <Feather name="chevron-right" size={15} color={colors.border} />
        ) : null}
      </View>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + "50" }]}>
        {children}
      </View>
    </View>
  );
}

function ModalSheet({
  visible, onClose, title, children,
}: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modalSheet, { backgroundColor: colors.card, borderColor: colors.border + "60" }]}>
          <View style={s.modalHandle} />
          <Text style={[s.modalTitle, { color: colors.foreground }]}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function PickerSheet({
  visible, onClose, title, options, value, onSelect,
}: {
  visible: boolean; onClose: () => void; title: string;
  options: string[]; value: string; onSelect: (v: string) => void;
}) {
  const colors = useColors();
  return (
    <ModalSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={{ maxHeight: 320 }}>
        {options.map((opt, i) => (
          <Pressable
            key={opt}
            onPress={() => { onSelect(opt); onClose(); }}
            style={({ pressed }) => [s.pickerRow, {
              backgroundColor: pressed ? `${RED}18` : "transparent",
              borderBottomColor: i < options.length - 1 ? colors.border + "40" : "transparent",
            }]}
          >
            <Text style={[s.pickerLabel, { color: opt === value ? RED : colors.foreground }]}>{opt}</Text>
            {opt === value && <Feather name="check" size={16} color={RED} />}
          </Pressable>
        ))}
      </ScrollView>
    </ModalSheet>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, setUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [watchedCount, setWatchedCount] = useState(0);
  const [listCount, setListCount] = useState(0);
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  const [profileBanner, setProfileBanner] = useState<string | null>(null);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const [bannerMovies, setBannerMovies] = useState<any[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(false);

  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [manualPrefs, setManualPrefs] = useState<ManualPreferences | null>(null);
  const [learnedPrefs, setLearnedPrefs] = useState<LearnedPreferences | null>(null);
  const [editGenres, setEditGenres] = useState<number[]>([]);
  const [editContentTypes, setEditContentTypes] = useState<string[]>([]);
  const [editDecades, setEditDecades] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [analyzingHistory, setAnalyzingHistory] = useState(false);

  const [pickerConfig, setPickerConfig] = useState<{ key: keyof UserSettings; title: string; options: string[] } | null>(null);

  const [editName, setEditName] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
      if (raw) setActiveProfile(JSON.parse(raw));
    } catch {}

    try {
      const banner = await AsyncStorage.getItem(BANNER_KEY);
      if (banner) setProfileBanner(banner);
    } catch {}

    if (user?.id && isSupabaseConfigured) {
      try {
        const dbUser = await db.users.getById(user.id);
        if (dbUser?.profile_banner) {
          setProfileBanner(dbUser.profile_banner);
          await AsyncStorage.setItem(BANNER_KEY, dbUser.profile_banner);
        }
      } catch {}
    }

    const localSettings = await getSettings();
    setSettings(localSettings);

    if (user?.id && isSupabaseConfigured) {
      const [progress, watchlistData, dbSettings] = await Promise.all([
        db.progress.getAll(user.id),
        db.watchlist.getAll(user.id),
        db.userSettings.get(user.id),
      ]);
      setWatchedCount(progress.length);
      setListCount(watchlistData.length);
      setWatchHistory(progress.slice(0, 20));
      setWatchlist(watchlistData);

      if (dbSettings) {
        const merged: Partial<UserSettings> = {};
        if (dbSettings.stream_quality) merged.streamQuality = dbSettings.stream_quality;
        if (dbSettings.audio_lang) merged.audioLang = dbSettings.audio_lang;
        if (dbSettings.subtitle_lang) merged.subtitleLang = dbSettings.subtitle_lang;
        if (dbSettings.auto_play !== undefined) merged.autoPlay = dbSettings.auto_play;
        if (dbSettings.pip !== undefined) merged.pip = dbSettings.pip;
        if (dbSettings.notif_push !== undefined) merged.notifPush = dbSettings.notif_push;
        if (dbSettings.notif_lancamentos !== undefined) merged.notifLancamentos = dbSettings.notif_lancamentos;
        if (dbSettings.notif_continue !== undefined) merged.notifContinue = dbSettings.notif_continue;
        if (dbSettings.notif_promo !== undefined) merged.notifPromo = dbSettings.notif_promo;
        if (dbSettings.parental_control !== undefined) merged.parentalControl = dbSettings.parental_control;
        if (dbSettings.content_rating) merged.contentRating = dbSettings.content_rating;
        if (dbSettings.wifi_only !== undefined) merged.wifiOnly = dbSettings.wifi_only;
        if (dbSettings.smart_download !== undefined) merged.smartDownload = dbSettings.smart_download;
        if (dbSettings.download_quality) merged.downloadQuality = dbSettings.download_quality;
        if (dbSettings.theme === "dark" || dbSettings.theme === "light") {
          merged.theme = dbSettings.theme;
          setTheme(dbSettings.theme);
        }
        const updated = { ...localSettings, ...merged };
        await saveSettings(updated);
        setSettings(updated);
      }
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    getMergedPreferences().then((p) => {
      if (p) setManualPrefs(p);
    });
    getLearnedPreferences().then((l) => {
      if (l) setLearnedPrefs(l);
    });
  }, []);

  const openPrefsModal = async () => {
    const [merged, learned] = await Promise.all([
      getMergedPreferences(),
      getLearnedPreferences(),
    ]);
    if (merged) {
      setManualPrefs(merged);
      setEditGenres(merged.genres ?? []);
      setEditContentTypes(merged.contentTypes ?? []);
      setEditDecades(merged.decades ?? []);
    } else {
      setEditGenres([]);
      setEditContentTypes([]);
      setEditDecades([]);
    }
    if (learned) setLearnedPrefs(learned);
    setShowPrefsModal(true);
  };

  const handleAnalyzeHistory = async () => {
    if (!watchHistory.length) return;
    setAnalyzingHistory(true);
    await analyzeWatchHistory(watchHistory.map((h) => ({
      tmdb_id: h.tmdb_id,
      type: h.type,
      progress: h.progress ?? 0.1,
    })));
    const learned = await getLearnedPreferences();
    if (learned) setLearnedPrefs(learned);
    setAnalyzingHistory(false);
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      const prefs: ManualPreferences = {
        genres: editGenres,
        contentTypes: editContentTypes,
        decades: editDecades,
        movies: manualPrefs?.movies ?? [],
        series: manualPrefs?.series ?? [],
      };
      await saveManualPreferences(prefs);
      setManualPrefs(prefs);
      if (user?.id) {
        await supabase.from("users").update({ preferences: prefs }).eq("id", user.id).catch(() => {});
      }
      setShowPrefsModal(false);
    } catch {}
    setSavingPrefs(false);
  };

  const handleClearLearned = () => {
    Alert.alert(
      "Limpar dados aprendidos",
      "Isso removerá todos os dados que o NETPLAY aprendeu com seu histórico. Suas preferências manuais serão mantidas.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar",
          style: "destructive",
          onPress: async () => {
            await clearLearnedPreferences();
            setLearnedPrefs(null);
          },
        },
      ]
    );
  };

  const fetchBannerMovies = async () => {
    setLoadingBanners(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=pt-BR&page=1`),
        fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}&language=pt-BR`),
      ]);
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      const combined = [...(d1.results ?? []), ...(d2.results ?? [])]
        .filter((m: any) => m.backdrop_path)
        .filter((m: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === m.id) === i)
        .slice(0, 24);
      setBannerMovies(combined);
    } catch {}
    setLoadingBanners(false);
  };

  const openBannerPicker = () => {
    setShowAvatarOptions(false);
    setShowBannerModal(true);
    if (bannerMovies.length === 0) fetchBannerMovies();
  };

  const selectBanner = async (backdropPath: string) => {
    const url = `${TMDB_IMG}/w1280${backdropPath}`;
    setProfileBanner(url);
    await AsyncStorage.setItem(BANNER_KEY, url);
    if (user?.id && isSupabaseConfigured) {
      await db.users.updateBanner(user.id, url);
    }
    setShowBannerModal(false);
  };

  const removeBanner = async () => {
    setProfileBanner(null);
    await AsyncStorage.removeItem(BANNER_KEY);
    if (user?.id && isSupabaseConfigured) {
      await db.users.updateBanner(user.id, null);
    }
    setShowBannerModal(false);
  };

  const handleSendReport = async () => {
    if (!reportText.trim()) return;
    setSendingReport(true);
    await new Promise((r) => setTimeout(r, 800));
    setSendingReport(false);
    setReportText("");
    setShowReportModal(false);
    Alert.alert("Enviado!", "Obrigado pelo seu feedback. Nossa equipe irá analisar em breve.");
  };

  const updateLocalSetting = async <K extends keyof UserSettings>(key: K, val: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
    await updateSetting(key, val);
    if (key === "theme") setTheme(val as "dark" | "light");
    const dbKey = SETTING_TO_DB[key];
    if (dbKey && user?.id && isSupabaseConfigured) {
      await db.userSettings.upsert(user.id, { [dbKey]: val } as Partial<DbUserSettings>);
    }
  };

  const handleNotifToggle = async (val: boolean) => {
    if (val) {
      const granted = await requestPermissionsAndSetup();
      if (granted && user?.id) {
        registerPushToken(user.id).catch(() => {});
      }
    }
    await setNotificationsEnabled(val);
    updateLocalSetting("notifPush", val);
  };

  const handleReRegisterToken = async () => {
    if (!user?.id) return;
    try {
      const granted = await requestPermissionsAndSetup();
      if (!granted) {
        Alert.alert(
          "Permissão negada",
          "Ative as notificações nas configurações do seu celular para receber alertas do NETPLAY.",
          [{ text: "OK" }]
        );
        return;
      }
      await registerPushToken(user.id);
      Alert.alert("Pronto!", "Seu dispositivo foi registrado para receber notificações push.");
    } catch {
      Alert.alert("Erro", "Não foi possível registrar o dispositivo. Tente novamente.");
    }
  };

  const openPicker = (key: keyof UserSettings, title: string, options: string[]) => {
    setPickerConfig({ key, title, options });
  };

  const handleSaveInfo = async () => {
    if (!editName.trim() || !user?.id) return;
    setSavingInfo(true);
    const { error } = await db.users.updateName(user.id, editName.trim());
    if (error) {
      Alert.alert("Erro", error);
    } else {
      await setUser({ ...user, name: editName.trim(), avatarLetter: editName[0].toUpperCase() });
      if (activeProfile) {
        const updated = { ...activeProfile, name: editName.trim() };
        setActiveProfile(updated);
        await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(updated));
      }
      setShowInfoModal(false);
    }
    setSavingInfo(false);
  };

  const handleChangePassword = async () => {
    if (!newPw || !currentPw || !user?.id) return;
    if (newPw.trim().length < 6) { Alert.alert("Erro", "A nova senha deve ter pelo menos 6 caracteres."); return; }
    if (newPw !== confirmPw) { Alert.alert("Erro", "As senhas não coincidem."); return; }
    setSavingPw(true);
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw.trim(),
    });
    if (reAuthError) { Alert.alert("Erro", "Senha atual incorreta."); setSavingPw(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw.trim() });
    if (error) { Alert.alert("Erro", error.message); } else {
      Alert.alert("Sucesso", "Senha alterada com sucesso!");
      setShowPasswordModal(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    }
    setSavingPw(false);
  };

  const handleClearHistory = () => {
    Alert.alert("Limpar Histórico", "Isso vai apagar todo o histórico de visualização. Continuar?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpar", style: "destructive", onPress: async () => {
          if (!user?.id) return;
          await db.progress.deleteAll(user.id);
          setWatchedCount(0);
          setWatchHistory([]);
          Alert.alert("Concluído", "Histórico apagado.");
        },
      },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert("Limpar Cache", "Isso vai limpar dados em cache do app. Continuar?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpar", style: "destructive", onPress: async () => {
          await AsyncStorage.multiRemove(["netplay_genre_cache", "netplay_tmdb_cache", "netplay_sync"]);
          Alert.alert("Concluído", "Cache limpo com sucesso!");
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Sair", "Deseja mesmo sair da conta?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
    ]);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `Estou usando o NETPLAY para assistir filmes e séries! Baixe agora: https://netplay.app` });
    } catch {}
  };

  const handleInvite = async () => {
    try {
      await Share.share({
        message: `Ei! Te convido para o NETPLAY — o melhor streaming! Cadastre-se com meu convite: https://netplay.app/invite/${user?.id?.slice(0, 8)}`,
      });
    } catch {}
  };

  const handleRate = async () => {
    const url = Platform.OS === "ios"
      ? "itms-apps://itunes.apple.com/app/id0000000000?action=write-review"
      : "market://details?id=com.netplay.app";
    const supported = await Linking.canOpenURL(url);
    if (supported) { Linking.openURL(url); } else {
      Linking.openURL("https://netplay.app/rate");
    }
  };

  const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

  const totalHours = Math.round((watchedCount * 92) / 60);
  const isPremium = user?.role === "admin" || true;
  const avatarUrl = activeProfile?.avatarUrl;
  const displayName = activeProfile?.name ?? user?.name ?? "Usuário";

  const removeWatchlistItem = async (item: WatchlistItem) => {
    if (!user?.id) return;
    await db.watchlist.remove(user.id, item.tmdb_id, item.type);
    setWatchlist((prev) => prev.filter((x) => !(x.tmdb_id === item.tmdb_id && x.type === item.type)));
    setListCount((c) => Math.max(0, c - 1));
  };

  const navigateToDetail = (id: number, type: "movie" | "tv", title: string) => {
    router.push({ pathname: "/detail", params: { type, id: String(id), title } });
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
      >
        {/* ── HERO HEADER ─────────────────────────────────── */}
        <View style={s.heroWrapper}>
          {profileBanner ? (
            <Image
              source={{ uri: profileBanner }}
              style={s.bannerImage}
              contentFit="cover"
            />
          ) : null}
          <LinearGradient
            colors={profileBanner
              ? ["rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)", colors.background]
              : ["#1a0000", "#0d0000", colors.background]}
            style={s.heroGradient}
          >
            <View style={[s.heroTop, { paddingTop: insets.top + 16 }]}>
              <Text style={[s.screenTitle, { color: "rgba(255,255,255,0.4)" }]}>MEU PERFIL</Text>
              {profileBanner && (
                <Pressable onPress={() => setShowBannerModal(true)} style={s.changeBannerBtn}>
                  <Feather name="image" size={13} color="rgba(255,255,255,0.5)" />
                  <Text style={s.changeBannerTxt}>Trocar banner</Text>
                </Pressable>
              )}
            </View>

            <View style={s.avatarArea}>
              <Pressable onPress={() => setShowAvatarOptions(true)} style={s.avatarBtn}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
                ) : (
                  <LinearGradient colors={[RED, "#8b0000"]} style={s.avatar}>
                    <Text style={s.avatarLetter}>{displayName[0]?.toUpperCase()}</Text>
                  </LinearGradient>
                )}
                <View style={[s.editBadge, { backgroundColor: RED }]}>
                  <Feather name="edit-2" size={11} color="#fff" />
                </View>
              </Pressable>

              <Text style={[s.userName, { color: colors.foreground }]}>{displayName}</Text>
              <Text style={[s.userEmail, { color: colors.mutedForeground }]}>{user?.email}</Text>

              <View style={s.badgesRow}>
                {isPremium && (
                  <View style={[s.roleBadge, { backgroundColor: `${RED}22`, borderColor: RED }]}>
                    <Feather name="star" size={10} color={RED} />
                    <Text style={[s.roleTxt, { color: RED }]}>PREMIUM</Text>
                  </View>
                )}
                {user?.role === "admin" && (
                  <View style={[s.roleBadge, { backgroundColor: "#fbbf2422", borderColor: "#fbbf24" }]}>
                    <Feather name="shield" size={10} color="#fbbf24" />
                    <Text style={[s.roleTxt, { color: "#fbbf24" }]}>ADMIN</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={[s.statsRow, { borderColor: colors.border + "40" }]}>
              {[
                { val: watchedCount, label: "Assistidos" },
                { val: listCount, label: "Na lista" },
                { val: 3, label: "Downloads" },
                { val: `${totalHours}h`, label: "Tempo total" },
              ].map((stat, i, arr) => (
                <View key={stat.label} style={[s.statItem, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border + "40" }]}>
                  <Text style={[s.statVal, { color: colors.foreground }]}>{stat.val}</Text>
                  <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── MINHA LISTA ──────────────────────────────────── */}
        {watchlist.length > 0 && (
          <View style={s.listSection}>
            <View style={s.listHeader}>
              <View style={s.listIconWrap}>
                <Feather name="bookmark" size={14} color={RED} />
              </View>
              <Text style={[s.listTitle, { color: colors.foreground }]}>Minha Lista</Text>
              <Text style={[s.listCount, { color: colors.mutedForeground }]}>{watchlist.length} títulos</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.listScroll}
            >
              {watchlist.map((item) => {
                const imgUri = item.poster_path ? `${TMDB_IMG}/w185${item.poster_path}` : null;
                return (
                  <Pressable
                    key={`${item.tmdb_id}-${item.type}`}
                    onPress={() => navigateToDetail(item.tmdb_id, item.type, item.title)}
                    style={s.listCard}
                  >
                    <View style={s.listCardInner}>
                      {imgUri ? (
                        <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
                          <Feather name="film" size={20} color="rgba(255,255,255,0.2)" />
                        </View>
                      )}
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.85)"]}
                        locations={[0.5, 1]}
                        style={StyleSheet.absoluteFill}
                      />
                      <Pressable
                        onPress={() => removeWatchlistItem(item)}
                        style={s.listRemoveBtn}
                        hitSlop={8}
                      >
                        <Feather name="x" size={12} color="#fff" />
                      </Pressable>
                      <View style={s.listCardBottom}>
                        <Text style={s.listCardTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={s.listTypeBadge}>
                          <Text style={s.listTypeText}>{item.type === "movie" ? "FILME" : "SÉRIE"}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {watchlist.length === 0 && (
          <View style={[s.listSection, { paddingBottom: 8 }]}>
            <View style={s.listHeader}>
              <View style={s.listIconWrap}>
                <Feather name="bookmark" size={14} color={RED} />
              </View>
              <Text style={[s.listTitle, { color: colors.foreground }]}>Minha Lista</Text>
            </View>
            <View style={s.listEmpty}>
              <Feather name="plus-circle" size={22} color="rgba(255,255,255,0.15)" />
              <Text style={s.listEmptyTxt}>Adicione filmes e séries à sua lista</Text>
            </View>
          </View>
        )}

        {/* ── APARÊNCIA ───────────────────────────────────── */}
        <Section title="APARÊNCIA">
          <Row
            icon={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"}
            label="Tema do Aplicativo"
            value={theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Sistema"}
            onPress={() => {
              const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
              setTheme(next as any);
              updateLocalSetting("theme", next === "system" ? "dark" : next as "dark" | "light");
            }}
            iconBg={theme === "dark" ? "#4f46e522" : theme === "light" ? "#f59e0b22" : "#06b6d422"}
            iconColor={theme === "dark" ? "#818cf8" : theme === "light" ? "#f59e0b" : "#06b6d4"}
            last
          />
        </Section>

        {/* ── MINHA CONTA ─────────────────────────────────── */}
        <Section title="MINHA CONTA">
          <Row icon="user" label="Informações Pessoais" onPress={() => { setEditName(displayName); setShowInfoModal(true); }} />
          <Row icon="lock" label="Alterar Senha" onPress={() => { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setShowPasswordModal(true); }} />
          <Row icon="credit-card" label="Meu Plano" value="Ver detalhes" accent onPress={() => router.push("/plan-select")} />
          <Row icon="clock" label="Histórico de Pagamentos" onPress={() => setShowPaymentsModal(true)} />
          <Row icon="monitor" label="Dispositivos Conectados" onPress={() => setShowDevicesModal(true)} last />
        </Section>

        {/* ── REPRODUÇÃO ──────────────────────────────────── */}
        <Section title="REPRODUÇÃO">
          <Row
            icon="play-circle" label="Reprodução Automática"
            toggle toggleValue={settings.autoPlay}
            onToggle={(v) => updateLocalSetting("autoPlay", v)}
          />
          <Row
            icon="wifi" label="Qualidade de Streaming" value={settings.streamQuality}
            onPress={() => openPicker("streamQuality", "Qualidade de Streaming", QUALITY_OPTIONS)}
          />
          <Row
            icon="volume-2" label="Idioma de Áudio" value={settings.audioLang}
            onPress={() => openPicker("audioLang", "Idioma de Áudio", AUDIO_OPTIONS)}
          />
          <Row
            icon="type" label="Idioma de Legenda" value={settings.subtitleLang}
            onPress={() => openPicker("subtitleLang", "Idioma de Legenda", SUBTITLE_OPTIONS)}
          />
          <Row
            icon="minimize-2" label="Picture in Picture (PiP)"
            toggle toggleValue={settings.pip}
            onToggle={(v) => updateLocalSetting("pip", v)}
            last
          />
        </Section>

        {/* ── NOTIFICAÇÕES ────────────────────────────────── */}
        <Section title="NOTIFICAÇÕES">
          <Row
            icon="bell" label="Notificações Push"
            toggle toggleValue={settings.notifPush}
            onToggle={handleNotifToggle}
          />
          <Row
            icon="clock" label="Histórico de Notificações"
            onPress={() => router.push("/notification-history")}
          />
          <Row
            icon="film" label="Novos Lançamentos"
            toggle toggleValue={settings.notifLancamentos}
            onToggle={(v) => updateLocalSetting("notifLancamentos", v)}
          />
          <Row
            icon="play" label="Continue Assistindo"
            toggle toggleValue={settings.notifContinue}
            onToggle={(v) => updateLocalSetting("notifContinue", v)}
          />
          <Row
            icon="tag" label="Promoções e Ofertas"
            toggle toggleValue={settings.notifPromo}
            onToggle={(v) => updateLocalSetting("notifPromo", v)}
          />
          <Row
            icon="smartphone" label="Registrar este dispositivo"
            value="Ativar push neste celular"
            onPress={handleReRegisterToken}
            last
          />
        </Section>

        {/* ── PRIVACIDADE ─────────────────────────────────── */}
        <Section title="PRIVACIDADE E CONTROLE">
          <Row
            icon="shield" label="Controle Parental"
            toggle toggleValue={settings.parentalControl}
            onToggle={(v) => updateLocalSetting("parentalControl", v)}
          />
          <Row
            icon="alert-circle" label="Classificação de Conteúdo" value={settings.contentRating}
            onPress={() => openPicker("contentRating", "Classificação de Conteúdo", CONTENT_RATING_OPTIONS)}
          />
          <Row
            icon="list" label="Histórico de Visualização"
            badge={watchedCount > 0 ? String(watchedCount) : undefined}
            onPress={() => setShowHistoryModal(true)}
          />
          <Row
            icon="trash-2" label="Limpar Histórico" danger
            onPress={handleClearHistory}
            last
          />
        </Section>

        {/* ── DOWNLOADS ───────────────────────────────────── */}
        <Section title="DOWNLOADS">
          <Row icon="download" label="Downloads Offline" onPress={() => router.push("/(tabs)/downloads")} />
          <Row
            icon="wifi" label="Apenas Wi-Fi"
            toggle toggleValue={settings.wifiOnly}
            onToggle={(v) => updateLocalSetting("wifiOnly", v)}
          />
          <Row
            icon="zap" label="Download Inteligente"
            toggle toggleValue={settings.smartDownload}
            onToggle={(v) => updateLocalSetting("smartDownload", v)}
          />
          <Row
            icon="hard-drive" label="Qualidade de Download" value={settings.downloadQuality}
            onPress={() => openPicker("downloadQuality", "Qualidade de Download", DOWNLOAD_QUALITY_OPTIONS)}
            last
          />
        </Section>

        {/* ── COMUNIDADE ──────────────────────────────────── */}
        <Section title="COMUNIDADE">
          <Row icon="share-2" label="Compartilhar Perfil" onPress={handleShare} />
          <Row icon="user-plus" label="Convidar Amigos" onPress={handleInvite} />
          <Row icon="star" label="Avaliar o NETPLAY" accent onPress={handleRate} last />
        </Section>

        {/* ── SUPORTE ─────────────────────────────────────── */}
        <Section title="SUPORTE">
          <Row icon="help-circle" label="Central de Ajuda" onPress={() => router.push("/help")} />
          <Row icon="flag" label="Reportar Problema" onPress={() => setShowReportModal(true)} />
          <Row icon="info" label="Novidades da Versão" onPress={() => setShowAboutModal(true)} />
          <Row icon="database" label="Limpar Cache" onPress={handleClearCache} last />
        </Section>

        {/* ── JURÍDICO ────────────────────────────────────── */}
        <Section title="JURÍDICO">
          <Row icon="file-text" label="Termos de Uso" onPress={() => setShowTermsModal(true)} />
          <Row icon="lock" label="Política de Privacidade" onPress={() => router.push("/privacy")} />
          <Row icon="info" label="Sobre o NETPLAY" onPress={() => setShowAboutModal(true)} last />
        </Section>

        {/* ── ADMINISTRAÇÃO (só admin) ─────────────────────── */}
        {user?.role === "admin" && (
          <Section title="ADMINISTRAÇÃO">
            <View style={{ marginBottom: 8 }}>
              <View style={{
                marginHorizontal: 16,
                marginBottom: 10,
                backgroundColor: "#fbbf2412",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#fbbf2430",
                paddingHorizontal: 14,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}>
                <Feather name="shield" size={14} color="#fbbf24" />
                <Text style={{ color: "#fbbf24", fontSize: 12, fontWeight: "600", flex: 1 }}>
                  Você tem acesso de administrador
                </Text>
              </View>
            </View>
            <Row
              icon="monitor"
              label="Painel Administrativo"
              iconBg="#fbbf2420"
              iconColor="#fbbf24"
              accent
              onPress={() => router.push("/admin")}
              last
            />
          </Section>
        )}

        {/* ── PERSONALIZAÇÃO ──────────────────────────────── */}
        <Section title="PERSONALIZAÇÃO DE CONTEÚDO">
          <Row
            icon="sliders"
            label="Personalizar Conteúdos"
            iconBg="#e5091422"
            iconColor={RED}
            accent
            badge={
              (manualPrefs?.genres?.length ?? 0) > 0
                ? `${manualPrefs!.genres.length} gênero${manualPrefs!.genres.length > 1 ? "s" : ""}`
                : learnedPrefs?.watchedCount
                ? "Auto"
                : undefined
            }
            badgeColor={learnedPrefs?.watchedCount ? "#4ade80" : RED}
            onPress={openPrefsModal}
          />
          <Row
            icon="cpu"
            label="Analisar meu histórico"
            iconBg="#4ade8022"
            iconColor="#4ade80"
            value={
              learnedPrefs
                ? `${learnedPrefs.watchedCount} título${learnedPrefs.watchedCount !== 1 ? "s" : ""} analisado${learnedPrefs.watchedCount !== 1 ? "s" : ""}`
                : watchHistory.length > 0 ? "Toque para analisar" : "Sem histórico ainda"
            }
            onPress={watchHistory.length > 0 ? handleAnalyzeHistory : undefined}
            last
          />
        </Section>

        {/* ── CONTA ───────────────────────────────────────── */}
        <Section title="CONTA">
          <Row icon="refresh-cw" label="Trocar Perfil" onPress={() => router.push("/profile-select")} />
          <Row icon="log-out" label="Sair da Conta" danger onPress={handleLogout} last />
        </Section>

        <Text style={[s.version, { color: colors.mutedForeground }]}>NETPLAY v2.1.0 · Feito com ❤️ no Brasil</Text>
      </ScrollView>

      {/* ── MODAL: OPÇÕES DO AVATAR ──────────────────────── */}
      <Modal visible={showAvatarOptions} transparent animationType="fade" onRequestClose={() => setShowAvatarOptions(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowAvatarOptions(false)}>
          <View style={[s.avatarOptionsSheet, { backgroundColor: colors.card, borderColor: colors.border + "60" }]}>
            <View style={s.modalHandle} />
            <Text style={[s.modalTitle, { color: colors.foreground }]}>Personalizar Perfil</Text>

            <Pressable
              onPress={() => { setShowAvatarOptions(false); router.push("/profile-select"); }}
              style={({ pressed }) => [s.avatarOption, { backgroundColor: pressed ? colors.border + "30" : "transparent" }]}
            >
              <View style={[s.avatarOptionIcon, { backgroundColor: RED + "22" }]}>
                <Feather name="user" size={18} color={RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.avatarOptionTitle, { color: colors.foreground }]}>Trocar Avatar</Text>
                <Text style={[s.avatarOptionSub, { color: colors.mutedForeground }]}>Escolha outro perfil ou avatar</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.border} />
            </Pressable>

            <Pressable
              onPress={openBannerPicker}
              style={({ pressed }) => [s.avatarOption, { backgroundColor: pressed ? colors.border + "30" : "transparent" }]}
            >
              <View style={[s.avatarOptionIcon, { backgroundColor: "#a78bfa22" }]}>
                <Feather name="image" size={18} color="#a78bfa" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.avatarOptionTitle, { color: colors.foreground }]}>Escolher Banner</Text>
                <Text style={[s.avatarOptionSub, { color: colors.mutedForeground }]}>
                  {profileBanner ? "Trocar imagem de fundo do perfil" : "Adicionar imagem de fundo premium"}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.border} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── MODAL: BANNER PICKER ─────────────────────────── */}
      <Modal visible={showBannerModal} transparent animationType="slide" onRequestClose={() => setShowBannerModal(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBannerModal(false)} />
          <View style={[s.bannerSheet, { backgroundColor: colors.card, borderColor: colors.border + "60" }]}>
            <View style={s.modalHandle} />
            <View style={s.bannerSheetHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground, marginBottom: 0 }]}>Escolher Banner</Text>
              {profileBanner && (
                <Pressable onPress={removeBanner} style={s.removeBannerBtn}>
                  <Feather name="trash-2" size={14} color={RED} />
                  <Text style={[s.removeBannerTxt, { color: RED }]}>Remover</Text>
                </Pressable>
              )}
            </View>
            <Text style={[s.bannerSheetSub, { color: colors.mutedForeground }]}>
              Selecione um backdrop para deixar seu perfil mais premium
            </Text>

            {loadingBanners ? (
              <View style={s.bannerLoading}>
                <View style={s.bannerLoadingDot} />
                <Text style={{ color: colors.mutedForeground, fontSize: 13, marginLeft: 10 }}>Carregando filmes...</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: SW * 0.7 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.bannerGrid}
              >
                {bannerMovies.map((movie: any) => {
                  const uri = `${TMDB_IMG}/w780${movie.backdrop_path}`;
                  const isSelected = profileBanner === `${TMDB_IMG}/w1280${movie.backdrop_path}`;
                  return (
                    <Pressable
                      key={movie.id}
                      onPress={() => selectBanner(movie.backdrop_path)}
                      style={[s.bannerThumb, isSelected && s.bannerThumbSelected]}
                    >
                      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.7)"]}
                        style={StyleSheet.absoluteFill}
                      />
                      {isSelected && (
                        <View style={s.bannerCheck}>
                          <Feather name="check" size={14} color="#fff" />
                        </View>
                      )}
                      <Text style={s.bannerMovieTitle} numberOfLines={1}>
                        {movie.title ?? movie.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: INFORMAÇÕES PESSOAIS ─────────────────── */}
      <ModalSheet visible={showInfoModal} onClose={() => setShowInfoModal(false)} title="Informações Pessoais">
        <View style={s.modalBody}>
          <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>Nome de exibição</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Seu nome"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
          />
          <Text style={[s.inputLabel, { color: colors.mutedForeground, marginTop: 14 }]}>E-mail</Text>
          <View style={[s.input, { backgroundColor: colors.background + "88", borderColor: colors.border, justifyContent: "center" }]}>
            <Text style={{ color: colors.mutedForeground }}>{user?.email}</Text>
          </View>
          <Pressable
            onPress={handleSaveInfo}
            style={[s.modalBtn, { backgroundColor: RED, opacity: savingInfo ? 0.7 : 1 }]}
            disabled={savingInfo}
          >
            <Text style={s.modalBtnTxt}>{savingInfo ? "Salvando..." : "Salvar Alterações"}</Text>
          </Pressable>
        </View>
      </ModalSheet>

      {/* ── MODAL: ALTERAR SENHA ────────────────────────── */}
      <ModalSheet visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Alterar Senha">
        <View style={s.modalBody}>
          {[
            { label: "Senha atual", val: currentPw, set: setCurrentPw },
            { label: "Nova senha", val: newPw, set: setNewPw },
            { label: "Confirmar nova senha", val: confirmPw, set: setConfirmPw },
          ].map(({ label, val, set }) => (
            <View key={label}>
              <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border, marginBottom: 12 }]}
                value={val}
                onChangeText={set}
                placeholder={label}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
              />
            </View>
          ))}
          <Pressable
            onPress={handleChangePassword}
            style={[s.modalBtn, { backgroundColor: RED, opacity: savingPw ? 0.7 : 1 }]}
            disabled={savingPw}
          >
            <Text style={s.modalBtnTxt}>{savingPw ? "Verificando..." : "Alterar Senha"}</Text>
          </Pressable>
        </View>
      </ModalSheet>

      {/* ── MODAL: PLANO PREMIUM ────────────────────────── */}
      <ModalSheet visible={showPlanModal} onClose={() => setShowPlanModal(false)} title="Seu Plano">
        <View style={s.modalBody}>
          <LinearGradient colors={["#1a0000", "#2a0505"]} style={s.planCard}>
            <View style={s.planRow}>
              <Feather name="star" size={20} color={RED} />
              <Text style={[s.planName, { color: "#fff" }]}>NETPLAY PREMIUM</Text>
            </View>
            <Text style={[s.planPrice, { color: RED }]}>R$ 39,90<Text style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>/mês</Text></Text>
            <View style={s.planFeatures}>
              {["4K + HDR + Dolby", "Telas simultâneas ilimitadas", "Download offline", "Sem anúncios", "Acesso antecipado"].map((f) => (
                <View key={f} style={s.planFeatureRow}>
                  <Feather name="check-circle" size={14} color="#4ade80" />
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginLeft: 8 }}>{f}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 12 }}>
              Próxima cobrança: 15 de junho de 2026
            </Text>
          </LinearGradient>
          <Pressable onPress={() => setShowPlanModal(false)} style={[s.modalBtn, { backgroundColor: colors.border + "40" }]}>
            <Text style={[s.modalBtnTxt, { color: colors.foreground }]}>Gerenciar Assinatura</Text>
          </Pressable>
        </View>
      </ModalSheet>

      {/* ── MODAL: DISPOSITIVOS ─────────────────────────── */}
      <ModalSheet visible={showDevicesModal} onClose={() => setShowDevicesModal(false)} title="Dispositivos Conectados">
        <View style={s.modalBody}>
          {[
            { name: "Celular Android", icon: "smartphone", last: "Agora mesmo", current: true },
            { name: "Smart TV Samsung", icon: "tv", last: "Ontem, 20:14" },
            { name: "Google Chrome", icon: "monitor", last: "28/05/2026" },
          ].map((d) => (
            <View key={d.name} style={[s.deviceRow, { borderColor: colors.border + "40" }]}>
              <View style={[s.deviceIcon, { backgroundColor: colors.border + "40" }]}>
                <Feather name={d.icon as any} size={16} color={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: colors.foreground, fontSize: 14, fontWeight: "600" }]}>{d.name}</Text>
                <Text style={[{ color: colors.mutedForeground, fontSize: 12 }]}>Último acesso: {d.last}</Text>
              </View>
              {d.current ? (
                <View style={[s.badge, { backgroundColor: "#4ade8022" }]}>
                  <Text style={[s.badgeTxt, { color: "#4ade80" }]}>Atual</Text>
                </View>
              ) : (
                <Pressable onPress={() => Alert.alert("Remover dispositivo", "Deseja remover este dispositivo?", [{ text: "Cancelar" }, { text: "Remover", style: "destructive" }])}>
                  <Feather name="x" size={18} color={RED} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      </ModalSheet>

      {/* ── MODAL: PAGAMENTOS ───────────────────────────── */}
      <ModalSheet visible={showPaymentsModal} onClose={() => setShowPaymentsModal(false)} title="Histórico de Pagamentos">
        <View style={s.modalBody}>
          {[
            { date: "15/05/2026", val: "R$ 39,90", status: "Pago" },
            { date: "15/04/2026", val: "R$ 39,90", status: "Pago" },
            { date: "15/03/2026", val: "R$ 39,90", status: "Pago" },
          ].map((p) => (
            <View key={p.date} style={[s.payRow, { borderColor: colors.border + "40" }]}>
              <View>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>NETPLAY Premium</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{p.date}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>{p.val}</Text>
                <View style={[s.badge, { backgroundColor: "#4ade8022" }]}>
                  <Text style={[s.badgeTxt, { color: "#4ade80" }]}>{p.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ModalSheet>

      {/* ── MODAL: HISTÓRICO ────────────────────────────── */}
      <ModalSheet visible={showHistoryModal} onClose={() => setShowHistoryModal(false)} title="Histórico de Visualização">
        <ScrollView style={{ maxHeight: 380 }}>
          {watchHistory.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Feather name="film" size={40} color={colors.border} />
              <Text style={[{ color: colors.mutedForeground, marginTop: 12, fontSize: 14 }]}>Nenhum conteúdo assistido ainda</Text>
            </View>
          ) : (
            watchHistory.map((item) => (
              <View key={item.id ?? item.tmdb_id} style={[s.histRow, { borderColor: colors.border + "40" }]}>
                <View style={[s.histThumb, { backgroundColor: colors.border + "40" }]}>
                  {item.poster_path ? (
                    <Image source={{ uri: item.poster_path }} style={{ width: 44, height: 64, borderRadius: 6 }} contentFit="cover" />
                  ) : <Feather name="film" size={20} color={colors.border} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
                    {item.type === "tv" && item.season ? `T${item.season}E${item.episode} · ` : ""}
                    {Math.round((item.progress ?? 0) * 100)}% assistido
                  </Text>
                  <View style={[s.histBar, { backgroundColor: colors.border + "50" }]}>
                    <View style={[s.histFill, { width: `${Math.round((item.progress ?? 0) * 100)}%` as any, backgroundColor: RED }]} />
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
        {watchHistory.length > 0 && (
          <View style={{ padding: 16 }}>
            <Pressable onPress={() => { setShowHistoryModal(false); setTimeout(handleClearHistory, 300); }}
              style={[s.modalBtn, { backgroundColor: `${RED}22` }]}>
              <Text style={[s.modalBtnTxt, { color: RED }]}>Limpar Histórico</Text>
            </Pressable>
          </View>
        )}
      </ModalSheet>

      {/* ── MODAL: SOBRE ────────────────────────────────── */}
      <ModalSheet visible={showAboutModal} onClose={() => setShowAboutModal(false)} title="Sobre o NETPLAY">
        <View style={s.modalBody}>
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <LinearGradient colors={[RED, "#8b0000"]} style={{ width: 70, height: 70, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>N</Text>
            </LinearGradient>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", marginTop: 12 }}>NETPLAY</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Versão 2.1.0 (build 210)</Text>
          </View>
          <View style={[s.aboutRow, { borderColor: colors.border + "40" }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20 }}>
              O NETPLAY é sua plataforma premium de streaming com conteúdo de qualidade. Filmes, séries, documentários e muito mais — tudo no seu bolso.{"\n\n"}
              Desenvolvido com ❤️ no Brasil. Conteúdo via TMDB.
            </Text>
          </View>
          {[
            { label: "Versão do app", val: "2.1.0" },
            { label: "Build", val: "210" },
            { label: "Plataforma", val: Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web" },
          ].map((row) => (
            <View key={row.label} style={[s.payRow, { borderColor: colors.border + "40" }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{row.label}</Text>
              <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{row.val}</Text>
            </View>
          ))}
        </View>
      </ModalSheet>

      {/* ── MODAL: TERMOS DE USO ────────────────────────── */}
      <ModalSheet visible={showTermsModal} onClose={() => setShowTermsModal(false)} title="Termos de Uso">
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          <View style={s.modalBody}>
            {[
              { title: "1. Aceitação", body: "Ao usar o NETPLAY, você concorda com estes termos. Se não concordar, não utilize o serviço." },
              { title: "2. Uso do Serviço", body: "O NETPLAY é oferecido para uso pessoal e não comercial. É proibido compartilhar credenciais ou redistribuir o conteúdo." },
              { title: "3. Conteúdo", body: "Todo conteúdo exibido é protegido por direitos autorais. O acesso é concedido apenas para visualização pessoal." },
              { title: "4. Conta", body: "Você é responsável por manter a segurança da sua conta e por todas as atividades que ocorrem nela." },
              { title: "5. Cancelamento", body: "Você pode cancelar sua assinatura a qualquer momento. O acesso continua até o fim do período pago." },
              { title: "6. Limitação de Responsabilidade", body: "O NETPLAY não se responsabiliza por interrupções do serviço, falhas técnicas ou danos indiretos." },
              { title: "7. Alterações", body: "Reservamos o direito de modificar estes termos. Notificaremos usuários sobre mudanças significativas." },
            ].map((sec) => (
              <View key={sec.title} style={[{ borderBottomWidth: 1, borderColor: colors.border + "40", paddingVertical: 14 }]}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", marginBottom: 6 }}>{sec.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{sec.body}</Text>
              </View>
            ))}
            <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "center", marginTop: 16 }}>
              Última atualização: maio de 2026
            </Text>
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ── MODAL: REPORTAR PROBLEMA ─────────────────────── */}
      <ModalSheet visible={showReportModal} onClose={() => { setShowReportModal(false); setReportText(""); }} title="Reportar Problema">
        <View style={s.modalBody}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18, marginBottom: 16 }}>
            Descreva o problema que você está enfrentando e nossa equipe irá analisar em breve.
          </Text>
          <View style={[{ borderWidth: 1, borderColor: colors.border + "80", borderRadius: 14, padding: 14, backgroundColor: colors.card, minHeight: 120 }]}>
            <TextInput
              value={reportText}
              onChangeText={setReportText}
              placeholder="Ex: O vídeo não carrega na tela de detalhes..."
              placeholderTextColor={colors.mutedForeground}
              style={{ color: colors.foreground, fontSize: 14, textAlignVertical: "top" }}
              multiline
              maxLength={500}
            />
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "right", marginTop: 6 }}>{reportText.length}/500</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <Pressable
              onPress={() => { setShowReportModal(false); setReportText(""); }}
              style={[s.modalBtn, { flex: 1, backgroundColor: colors.border + "40" }]}
            >
              <Text style={[s.modalBtnTxt, { color: colors.foreground }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={handleSendReport}
              disabled={!reportText.trim() || sendingReport}
              style={[s.modalBtn, { flex: 1, backgroundColor: reportText.trim() ? RED : colors.border + "40" }]}
            >
              {sendingReport ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[s.modalBtnTxt, { color: "#fff" }]}>Enviar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ModalSheet>

      {/* ── PERSONALIZAÇÃO MODAL ────────────────────────── */}
      <Modal
        visible={showPrefsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPrefsModal(false)}
      >
        <View style={s.prefsModalOverlay}>
          <View style={[s.prefsSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.prefsHandle} />
            <View style={[s.prefsHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.prefsTitle, { color: colors.foreground }]}>Personalizar Conteúdos</Text>
              <Text style={[s.prefsSub, { color: colors.mutedForeground }]}>
                Ajuste seus gostos ou veja o que o NETPLAY aprendeu sobre você
              </Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* O QUE O APP APRENDEU */}
              <View style={s.prefsSection}>
                <Text style={[s.prefsSectionTitle, { color: colors.foreground }]}>O QUE O NETPLAY APRENDEU</Text>
                {learnedPrefs && learnedPrefs.genreScores.length > 0 ? (
                  <View style={[s.learnedCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[s.prefsSub, { color: colors.mutedForeground, marginBottom: 12 }]}>
                      Baseado em {learnedPrefs.watchedCount} título{learnedPrefs.watchedCount !== 1 ? "s" : ""} que você assistiu
                    </Text>
                    {learnedPrefs.genreScores.slice(0, 6).map((g, idx) => {
                      const maxScore = learnedPrefs.genreScores[0]?.score ?? 1;
                      const pct = g.score / maxScore;
                      return (
                        <View key={g.id} style={s.learnedRow}>
                          <Text style={[s.learnedGenreName, { color: colors.foreground }]}>{g.name}</Text>
                          <View style={[s.learnedGenreBar, { backgroundColor: colors.border }]}>
                            <View style={[s.learnedGenreFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: idx === 0 ? RED : colors.primary ?? "#4ade80" }]} />
                          </View>
                          <Text style={[s.learnedGenreCount, { color: colors.mutedForeground }]}>{g.count}x</Text>
                        </View>
                      );
                    })}
                    {watchHistory.length > 0 && (
                      <TouchableOpacity
                        style={[s.analyzeBtn, { borderColor: colors.border }]}
                        onPress={handleAnalyzeHistory}
                        disabled={analyzingHistory}
                      >
                        {analyzingHistory
                          ? <ActivityIndicator size="small" color={colors.foreground} />
                          : <Feather name="refresh-cw" size={14} color={colors.foreground} />
                        }
                        <Text style={[{ color: colors.foreground, fontSize: 13, fontWeight: "600" }]}>
                          {analyzingHistory ? "Analisando..." : "Reanalisar histórico"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={s.clearLearnedBtn} onPress={handleClearLearned}>
                      <Feather name="trash-2" size={13} color="#ef4444" />
                      <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600" }}>Limpar dados aprendidos</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[s.learnedCard, { backgroundColor: colors.background, borderColor: colors.border, alignItems: "center", paddingVertical: 20 }]}>
                    <Feather name="cpu" size={28} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
                    <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 4 }}>Nada aprendido ainda</Text>
                    <Text style={[s.prefsSub, { color: colors.mutedForeground, textAlign: "center" }]}>
                      {watchHistory.length > 0
                        ? "Toque em \"Reanalisar\" para processar seu histórico"
                        : "Assista alguns títulos e o NETPLAY aprenderá seu gosto automaticamente"}
                    </Text>
                    {watchHistory.length > 0 && (
                      <TouchableOpacity
                        style={[s.analyzeBtn, { borderColor: colors.border, marginTop: 14 }]}
                        onPress={handleAnalyzeHistory}
                        disabled={analyzingHistory}
                      >
                        {analyzingHistory
                          ? <ActivityIndicator size="small" color={colors.foreground} />
                          : <Feather name="cpu" size={14} color={colors.foreground} />
                        }
                        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                          {analyzingHistory ? "Analisando..." : `Analisar ${watchHistory.length} título${watchHistory.length !== 1 ? "s" : ""}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* GÊNEROS */}
              <View style={s.prefsSection}>
                <Text style={[s.prefsSectionTitle, { color: colors.foreground }]}>GÊNEROS FAVORITOS</Text>
                <Text style={[s.prefsSectionSub, { color: colors.mutedForeground }]}>Selecione todos que você curte</Text>
                <View style={s.chipRow}>
                  {[
                    { id: 28, name: "Ação" }, { id: 12, name: "Aventura" }, { id: 16, name: "Animação" },
                    { id: 35, name: "Comédia" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentário" },
                    { id: 18, name: "Drama" }, { id: 10751, name: "Família" }, { id: 14, name: "Fantasia" },
                    { id: 27, name: "Terror" }, { id: 9648, name: "Mistério" }, { id: 10749, name: "Romance" },
                    { id: 878, name: "Ficção Científica" }, { id: 53, name: "Suspense" }, { id: 37, name: "Faroeste" },
                    { id: 10752, name: "Guerra" }, { id: 36, name: "História" }, { id: 10402, name: "Música" },
                  ].map((genre) => {
                    const sel = editGenres.includes(genre.id);
                    const isLearned = (learnedPrefs?.genreScores ?? []).slice(0, 3).some((g) => g.id === genre.id);
                    return (
                      <TouchableOpacity
                        key={genre.id}
                        style={[
                          s.chip,
                          sel
                            ? { backgroundColor: RED, borderColor: RED }
                            : isLearned
                            ? { backgroundColor: "#4ade8022", borderColor: "#4ade8066" }
                            : { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                        onPress={() =>
                          setEditGenres((prev) =>
                            prev.includes(genre.id) ? prev.filter((g) => g !== genre.id) : [...prev, genre.id]
                          )
                        }
                      >
                        <Text style={{ color: sel ? "#fff" : isLearned ? "#4ade80" : colors.foreground, fontSize: 13, fontWeight: sel ? "700" : "500" }}>
                          {genre.name}{isLearned && !sel ? " ✦" : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* TIPO DE CONTEÚDO */}
              <View style={s.prefsSection}>
                <Text style={[s.prefsSectionTitle, { color: colors.foreground }]}>TIPO DE CONTEÚDO</Text>
                <View style={s.chipRow}>
                  {["Filmes", "Séries", "Animes", "Documentários"].map((ct) => {
                    const sel = editContentTypes.includes(ct);
                    return (
                      <TouchableOpacity
                        key={ct}
                        style={[
                          s.chip,
                          sel
                            ? { backgroundColor: RED, borderColor: RED }
                            : { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                        onPress={() =>
                          setEditContentTypes((prev) =>
                            prev.includes(ct) ? prev.filter((c) => c !== ct) : [...prev, ct]
                          )
                        }
                      >
                        <Text style={{ color: sel ? "#fff" : colors.foreground, fontSize: 13, fontWeight: sel ? "700" : "500" }}>{ct}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* DÉCADAS */}
              <View style={s.prefsSection}>
                <Text style={[s.prefsSectionTitle, { color: colors.foreground }]}>DÉCADAS FAVORITAS</Text>
                <View style={s.chipRow}>
                  {["Clássicos (antes de 1980)", "Anos 80", "Anos 90", "Anos 2000", "Anos 2010", "2020 em diante"].map((dec) => {
                    const sel = editDecades.includes(dec);
                    return (
                      <TouchableOpacity
                        key={dec}
                        style={[
                          s.chip,
                          sel
                            ? { backgroundColor: RED, borderColor: RED }
                            : { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                        onPress={() =>
                          setEditDecades((prev) =>
                            prev.includes(dec) ? prev.filter((d) => d !== dec) : [...prev, dec]
                          )
                        }
                      >
                        <Text style={{ color: sel ? "#fff" : colors.foreground, fontSize: 13, fontWeight: sel ? "700" : "500" }}>{dec}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Botões de ação */}
            <View style={[{ borderTopWidth: 1, paddingBottom: 12, backgroundColor: colors.card }, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[s.prefsSaveBtn, { backgroundColor: RED }]}
                onPress={handleSavePrefs}
                disabled={savingPrefs}
              >
                {savingPrefs
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.prefsSaveBtnTxt}>SALVAR PREFERÊNCIAS</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowPrefsModal(false)} style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── PICKER ──────────────────────────────────────── */}
      {pickerConfig && (
        <PickerSheet
          visible={!!pickerConfig}
          onClose={() => setPickerConfig(null)}
          title={pickerConfig.title}
          options={pickerConfig.options}
          value={String(settings[pickerConfig.key])}
          onSelect={(v) => updateLocalSetting(pickerConfig.key, v as any)}
        />
      )}
    </View>
  );
}

const CARD_W = (SW - 48) / 2;

const s = StyleSheet.create({
  container: { flex: 1 },
  heroWrapper: { position: "relative" },
  bannerImage: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 320,
  },
  heroGradient: { paddingBottom: 24 },
  heroTop: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  screenTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 3 },
  changeBannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  changeBannerTxt: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  avatarArea: { alignItems: "center", paddingBottom: 20 },
  avatarBtn: { position: "relative", marginBottom: 14 },
  avatar: {
    width: 92, height: 92, borderRadius: 46,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: RED,
    shadowColor: RED, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
  avatarLetter: { color: "#fff", fontSize: 36, fontWeight: "800" },
  editBadge: {
    position: "absolute", right: 0, bottom: 0,
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#000",
  },
  userName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  userEmail: { fontSize: 13, marginTop: 3, marginBottom: 12 },
  badgesRow: { flexDirection: "row", gap: 8 },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  roleTxt: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  statsRow: {
    flexDirection: "row", marginHorizontal: 20,
    borderRadius: 16, borderWidth: 1,
    overflow: "hidden",
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 14 },
  statVal: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: "500" },

  // Minha Lista inline
  listSection: { paddingTop: 24, paddingBottom: 20 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 8,
  },
  listIconWrap: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  listTitle: { fontSize: 16, fontWeight: "800", flex: 1, letterSpacing: -0.3 },
  listCount: { fontSize: 12, fontWeight: "600" },
  listScroll: { paddingHorizontal: 20, paddingBottom: 4, gap: 10 },
  listCard: { marginRight: 0 },
  listCardInner: {
    width: 110, height: 165,
    borderRadius: 14, overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "flex-end",
  },
  listRemoveBtn: {
    position: "absolute", top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  listCardBottom: { padding: 8, gap: 4 },
  listCardTitle: { fontSize: 10, fontWeight: "700", color: "#fff", lineHeight: 13 },
  listTypeBadge: {
    backgroundColor: "rgba(229,9,20,0.3)",
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
    alignSelf: "flex-start",
  },
  listTypeText: { fontSize: 8, fontWeight: "800", color: RED, letterSpacing: 0.5 },
  listEmpty: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    borderStyle: "dashed",
  },
  listEmptyTxt: { fontSize: 13, color: "rgba(255,255,255,0.25)", flex: 1 },

  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 14 },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: "500" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValue: { fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeTxt: { fontSize: 11, fontWeight: "700" },
  version: { textAlign: "center", fontSize: 12, marginTop: 8 },

  // Avatar options modal
  avatarOptionsSheet: {
    marginHorizontal: 20,
    marginBottom: 40,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  avatarOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  avatarOptionIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  avatarOptionTitle: { fontSize: 15, fontWeight: "700" },
  avatarOptionSub: { fontSize: 12, marginTop: 2 },

  // Banner picker modal
  bannerSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, paddingBottom: 40,
    maxHeight: "90%",
  },
  bannerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  bannerSheetSub: { fontSize: 13, paddingHorizontal: 24, marginBottom: 16 },
  removeBannerBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  removeBannerTxt: { fontSize: 13, fontWeight: "600" },
  bannerLoading: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", padding: 40,
  },
  bannerLoadingDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: RED,
  },
  bannerGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, gap: 8,
  },
  bannerThumb: {
    width: CARD_W,
    height: CARD_W * 0.56,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    justifyContent: "flex-end",
    borderWidth: 2,
    borderColor: "transparent",
  },
  bannerThumbSelected: {
    borderColor: RED,
    shadowColor: RED,
    shadowRadius: 8,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
  },
  bannerCheck: {
    position: "absolute", top: 8, right: 8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: RED,
    alignItems: "center", justifyContent: "center",
  },
  bannerMovieTitle: {
    fontSize: 10, fontWeight: "700", color: "#fff",
    paddingHorizontal: 8, paddingBottom: 6,
  },

  modalOverlay: {
    flex: 1, justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, paddingBottom: 40, maxHeight: "85%",
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginTop: 12, marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", paddingHorizontal: 24, marginBottom: 4 },
  modalBody: { paddingHorizontal: 20, paddingTop: 12 },
  inputLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginBottom: 6 },
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, marginBottom: 0,
  },
  modalBtn: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: "center", marginTop: 20,
  },
  modalBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  pickerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pickerLabel: { fontSize: 15 },
  planCard: { borderRadius: 16, padding: 20, marginBottom: 4 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  planName: { fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  planPrice: { fontSize: 28, fontWeight: "900", marginBottom: 16 },
  planFeatures: { gap: 8 },
  planFeatureRow: { flexDirection: "row", alignItems: "center" },
  deviceRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  deviceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1,
  },
  histRow: {
    flexDirection: "row", gap: 12, paddingVertical: 12,
    paddingHorizontal: 20, borderBottomWidth: 1,
  },
  histThumb: { width: 44, height: 64, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  histBar: { height: 3, borderRadius: 2, marginTop: 8, overflow: "hidden" },
  histFill: { height: 3, borderRadius: 2 },
  aboutRow: { paddingVertical: 16, borderBottomWidth: 1, borderTopWidth: 1, marginVertical: 12 },

  prefsModalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.72)" },
  prefsSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, maxHeight: "92%",
  },
  prefsHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  prefsHeader: {
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  prefsTitle: { fontSize: 18, fontWeight: "800", marginBottom: 3 },
  prefsSub: { fontSize: 12, opacity: 0.5 },
  prefsSection: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  prefsSectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1, opacity: 0.5, textTransform: "uppercase", marginBottom: 10 },
  prefsSectionSub: { fontSize: 11, opacity: 0.45, marginTop: -6, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  learnedCard: {
    borderRadius: 14, padding: 14, marginBottom: 4, borderWidth: 1,
  },
  learnedRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
  learnedGenreBar: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  learnedGenreFill: { height: 4, borderRadius: 2 },
  learnedGenreName: { fontSize: 13, fontWeight: "600", width: 120 },
  learnedGenreCount: { fontSize: 11, opacity: 0.45, width: 50, textAlign: "right" },
  learnedMeta: { fontSize: 12, opacity: 0.4, marginTop: 4 },
  clearLearnedBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, alignSelf: "flex-start" },
  analyzeBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9,
    marginTop: 10, alignSelf: "flex-start",
  },
  prefsSaveBtn: {
    borderRadius: 14, paddingVertical: 16,
    alignItems: "center", marginHorizontal: 20, marginTop: 8, marginBottom: 8,
  },
  prefsSaveBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

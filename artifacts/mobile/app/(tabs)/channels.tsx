import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  DRIVE_ROOTS,
  formatSize,
  isFolder,
  isVideo,
  listFolderAll,
  parseEpisodeInfo,
} from "@/lib/gdrive-index";
import {
  runDriveScan,
  groupByGenre,
  clearCatalogCache,
  type CatalogItem,
} from "@/lib/drive-catalog";
import { ContentRow } from "@/components/ContentRow";

const RED = "#e50914";
type BreadcrumbItem = { label: string; drive: 0 | 1; path: string };
type Mode = "catalog" | "browse";

// --- Catalog View ---
function CatalogView({
  onSwitchToBrowse,
  insets,
}: {
  onSwitchToBrowse: () => void;
  insets: ReturnType<typeof import("react-native-safe-area-context").useSafeAreaInsets>;
}) {
  const colors = useColors();
  const router = useRouter();
  const [genres, setGenres] = useState<{ genre: string; items: CatalogItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) {
      clearCatalogCache();
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setProgress({ loaded: 0, total: 0 });

    runDriveScan((loaded, total) => {
      setProgress({ loaded, total });
      Animated.timing(progressAnim, {
        toValue: total > 0 ? loaded / total : 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    })
      .then((items) => {
        setGenres(groupByGenre(items));
      })
      .catch(() => setGenres([]))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const handleItemPress = (item: import("@/constants/content").ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.type,
        id: String(item.tmdbId),
        title: item.title,
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.headerLeft}>
          <View style={[s.headerAccent, { backgroundColor: RED }]} />
          <Text style={s.headerTitle}>Acervo</Text>
        </View>
        <TouchableOpacity
          onPress={onSwitchToBrowse}
          style={[s.browseBtn, { borderColor: colors.border + "80" }]}
          activeOpacity={0.7}
        >
          <Feather name="folder" size={14} color={colors.mutedForeground} />
          <Text style={[s.browseBtnText, { color: colors.mutedForeground }]}>
            Pastas
          </Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar while scanning */}
      {(loading || refreshing) && (
        <View style={s.progressWrap}>
          <View style={[s.progressTrack, { backgroundColor: colors.border + "50" }]}>
            <Animated.View
              style={[
                s.progressFill,
                {
                  backgroundColor: RED,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[s.progressText, { color: colors.mutedForeground }]}>
            {progress.total > 0
              ? `Buscando metadados… ${progress.loaded}/${progress.total}`
              : "Lendo pastas do Drive…"}
          </Text>
        </View>
      )}

      {loading && genres.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={[s.loadingLabel, { color: colors.mutedForeground }]}>
            Organizando por gênero…
          </Text>
        </View>
      ) : genres.length === 0 ? (
        <View style={s.center}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            Nenhum conteúdo encontrado
          </Text>
          <TouchableOpacity
            onPress={() => load(true)}
            style={[s.retryBtn, { borderColor: RED }]}
          >
            <Text style={{ color: RED, fontSize: 14, fontWeight: "600" }}>
              Tentar novamente
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={RED}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {genres.map(({ genre, items }) => (
            <ContentRow
              key={genre}
              title={genre}
              icon="dot"
              items={items.slice(0, 10)}
              cardWidth={110}
              cardHeight={162}
              seeAllLabel={items.length > 10 ? `Ver todos (${items.length})` : undefined}
              onSeeAll={
                items.length > 10
                  ? () =>
                      router.push({
                        pathname: "/acervo-genre",
                        params: { genre },
                      })
                  : undefined
              }
              onItemPress={handleItemPress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// --- Browse View (file browser, unchanged logic) ---
export default function ChannelsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    drive?: string;
    folderPath?: string;
    folderLabel?: string;
  }>();

  // Default to browse if deep-linked, else catalog
  const [mode, setMode] = useState<Mode>(params.folderPath ? "browse" : "catalog");

  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [items, setItems] = useState<ReturnType<typeof Array<any>>>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeDrive, setActiveDrive] = useState<0 | 1 | null>(null);
  const [activePath, setActivePath] = useState("");

  const fetchFolder = useCallback(
    async (drive: 0 | 1, path: string, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const result = await listFolderAll(drive, path);
      setItems(result);
      setActiveDrive(drive);
      setActivePath(path);
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    },
    []
  );

  const navigateTo = useCallback(
    (drive: 0 | 1, path: string, label: string) => {
      setSearch("");
      setBreadcrumbs((prev) => {
        if (path === "") return [];
        return [...prev, { label, drive, path }];
      });
      fetchFolder(drive, path);
    },
    [fetchFolder]
  );

  const goBack = useCallback(() => {
    if (breadcrumbs.length === 0) {
      setMode("catalog");
      return;
    }
    const newCrumbs = breadcrumbs.slice(0, -1);
    setBreadcrumbs(newCrumbs);
    setSearch("");
    if (newCrumbs.length === 0) {
      setItems([]);
      setActiveDrive(null);
      setActivePath("");
    } else {
      const prev = newCrumbs[newCrumbs.length - 1];
      fetchFolder(prev.drive, prev.path);
    }
  }, [breadcrumbs, fetchFolder]);

  const jumpToCrumb = useCallback(
    (index: number) => {
      setSearch("");
      if (index === 0) {
        setBreadcrumbs([]);
        setItems([]);
        setActiveDrive(null);
        setActivePath("");
        return;
      }
      const newCrumbs = breadcrumbs.slice(0, index);
      const crumb = newCrumbs[newCrumbs.length - 1];
      setBreadcrumbs(newCrumbs);
      fetchFolder(crumb.drive, crumb.path);
    },
    [breadcrumbs, fetchFolder]
  );

  // Auto-navigate on deep-link
  useEffect(() => {
    const driveParam = params.drive;
    const pathParam = params.folderPath;
    const labelParam = params.folderLabel;
    if (!driveParam || !pathParam) return;
    const driveNum = parseInt(driveParam, 10) as 0 | 1;
    if (driveNum !== 0 && driveNum !== 1) return;
    const label = labelParam || pathParam.split("/").pop() || pathParam;
    setMode("browse");
    setBreadcrumbs([{ label, drive: driveNum, path: pathParam }]);
    fetchFolder(driveNum, pathParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.drive, params.folderPath]);

  const handleItemPress = useCallback(
    (item: any) => {
      if (isFolder(item)) {
        const newPath = activePath ? `${activePath}/${item.name}` : item.name;
        navigateTo(activeDrive!, newPath, item.name);
      } else if (isVideo(item)) {
        const siblings = items.filter(isVideo);
        router.push({
          pathname: "/gdrive-player",
          params: {
            fileName: item.name,
            fileLink: item.link ?? "",
            drive: String(activeDrive),
            folderPath: activePath,
            playlist: JSON.stringify(
              siblings.map((s: any) => ({ name: s.name, link: s.link ?? "" }))
            ),
            currentIndex: String(siblings.findIndex((s: any) => s.id === item.id)),
          },
        });
      }
    },
    [activeDrive, activePath, navigateTo, items, router]
  );

  // Render catalog mode
  if (mode === "catalog") {
    return (
      <CatalogView
        onSwitchToBrowse={() => {
          setBreadcrumbs([]);
          setItems([]);
          setActiveDrive(null);
          setActivePath("");
          setMode("browse");
        }}
        insets={insets}
      />
    );
  }

  // Browse mode
  const filtered = search.trim()
    ? items.filter((it: any) =>
        it.name.toLowerCase().includes(search.toLowerCase())
      )
    : items;
  const isRoot = breadcrumbs.length === 0;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={goBack} style={s.backBtn}>
          <Feather name="chevron-left" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerTitleWrap}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {isRoot
              ? "Pastas"
              : breadcrumbs[breadcrumbs.length - 1]?.label ?? "Acervo"}
          </Text>
          {!isRoot && activeDrive !== null && (
            <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
              {DRIVE_ROOTS[activeDrive].name}
            </Text>
          )}
        </View>
      </View>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <FlatList
          horizontal
          data={[{ label: "Início", drive: 0 as const, path: "" }, ...breadcrumbs]}
          keyExtractor={(_, i) => String(i)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.breadcrumbRow}
          renderItem={({ item: crumb, index }) => (
            <TouchableOpacity
              onPress={() => jumpToCrumb(index)}
              style={s.crumbBtn}
            >
              <Text
                style={[
                  s.crumbText,
                  {
                    color:
                      index === breadcrumbs.length
                        ? colors.foreground
                        : colors.mutedForeground,
                    fontWeight: index === breadcrumbs.length ? "700" : "400",
                  },
                ]}
                numberOfLines={1}
              >
                {crumb.label}
              </Text>
              {index < breadcrumbs.length && (
                <Feather
                  name="chevron-right"
                  size={12}
                  color={colors.mutedForeground}
                  style={{ marginHorizontal: 2 }}
                />
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Search bar */}
      {!isRoot && (
        <View
          style={[
            s.searchBar,
            { backgroundColor: colors.card, borderColor: colors.border + "60" },
          ]}
        >
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Filtrar..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={[s.loadingLabel, { color: colors.mutedForeground }]}>
            Carregando…
          </Text>
        </View>
      ) : isRoot ? (
        <FlatList
          data={DRIVE_ROOTS}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          renderItem={({ item: root }) => (
            <View style={{ marginBottom: 20 }}>
              <View style={s.driveTitleRow}>
                <Text style={s.driveEmoji}>{root.icon}</Text>
                <Text style={[s.driveTitle, { color: colors.foreground }]}>
                  {root.name}
                </Text>
              </View>
              {root.folders.map((folder) => (
                <Pressable
                  key={folder}
                  onPress={() => navigateTo(root.drive, folder, folder)}
                  style={({ pressed }) => [
                    s.folderCard,
                    {
                      backgroundColor: pressed
                        ? colors.border + "50"
                        : colors.card,
                      borderColor: colors.border + "50",
                    },
                  ]}
                >
                  <View style={[s.folderIconWrap, { backgroundColor: RED + "20" }]}>
                    <Feather name="folder" size={20} color={RED} />
                  </View>
                  <Text style={[s.folderName, { color: colors.foreground }]}>
                    {folder}
                  </Text>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              ))}
            </View>
          )}
          ListHeaderComponent={
            <View
              style={[s.heroBanner, { backgroundColor: RED + "15", borderColor: RED + "40" }]}
            >
              <Feather name="hard-drive" size={22} color={RED} />
              <View style={{ flex: 1 }}>
                <Text style={[s.heroTitle, { color: "#fff" }]}>Acervo Drive</Text>
                <Text style={[s.heroSub, { color: colors.mutedForeground }]}>
                  Animes · Desenhos · Filmes · Séries · Novelas
                </Text>
              </View>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchFolder(activeDrive!, activePath, true)}
              tintColor={RED}
            />
          }
          contentContainerStyle={{
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 12,
            paddingTop: 4,
          }}
          ListEmptyComponent={
            <View style={s.center}>
              <Feather name="inbox" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                {search ? "Nenhum resultado encontrado" : "Pasta vazia"}
              </Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const folder = isFolder(item);
            const video = isVideo(item);
            const ep = !folder ? parseEpisodeInfo(item.name) : null;
            const displayName = ep
              ? item.name.replace(/\.[^.]+$/, "")
              : item.name;

            return (
              <Pressable
                onPress={() => handleItemPress(item)}
                style={({ pressed }) => [
                  s.itemRow,
                  {
                    backgroundColor: pressed ? colors.border + "40" : colors.card,
                    borderColor: colors.border + "40",
                  },
                ]}
              >
                <View
                  style={[
                    s.itemIcon,
                    {
                      backgroundColor: folder
                        ? RED + "20"
                        : video
                        ? "#16a34a22"
                        : colors.border + "30",
                    },
                  ]}
                >
                  <Feather
                    name={folder ? "folder" : video ? "play-circle" : "file"}
                    size={18}
                    color={folder ? RED : video ? "#4ade80" : colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1, marginRight: 6 }}>
                  {ep?.season !== undefined && ep?.episode !== undefined && (
                    <View style={s.epBadgeRow}>
                      <View style={[s.epBadge, { backgroundColor: RED + "22" }]}>
                        <Text style={[s.epBadgeText, { color: RED }]}>
                          S{String(ep.season).padStart(2, "0")}E
                          {String(ep.episode).padStart(2, "0")}
                        </Text>
                      </View>
                    </View>
                  )}
                  <Text
                    style={[s.itemName, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {displayName}
                  </Text>
                  {!folder && (
                    <Text style={[s.itemMeta, { color: colors.mutedForeground }]}>
                      {item.fileExtension?.toUpperCase() ?? ""}
                      {item.size ? `  ·  ${formatSize(item.size)}` : ""}
                    </Text>
                  )}
                </View>
                <Feather
                  name={folder ? "chevron-right" : video ? "play" : "download"}
                  size={15}
                  color={colors.mutedForeground}
                />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  headerAccent: { width: 3, height: 22, borderRadius: 2 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerTitleWrap: { flex: 1 },
  headerSub: { fontSize: 11, marginTop: 1 },
  backBtn: { marginRight: 8, padding: 4 },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  browseBtnText: { fontSize: 13, fontWeight: "500" },
  progressWrap: { paddingHorizontal: 16, paddingBottom: 10, gap: 4 },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: { fontSize: 11 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },
  loadingLabel: { fontSize: 14 },
  emptyText: { fontSize: 14, textAlign: "center" },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginTop: 4,
  },
  breadcrumbRow: { paddingHorizontal: 16, paddingBottom: 6, alignItems: "center" },
  crumbBtn: { flexDirection: "row", alignItems: "center" },
  crumbText: { fontSize: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  heroBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  heroTitle: { fontSize: 16, fontWeight: "800" },
  heroSub: { fontSize: 12, marginTop: 2 },
  driveTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  driveEmoji: { fontSize: 18 },
  driveTitle: { fontSize: 15, fontWeight: "700" },
  folderCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 13,
    marginBottom: 8,
    gap: 12,
  },
  folderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  folderName: { flex: 1, fontSize: 15, fontWeight: "600" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 11,
    marginBottom: 6,
    gap: 10,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  epBadgeRow: { flexDirection: "row", marginBottom: 3 },
  epBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  epBadgeText: { fontSize: 10, fontWeight: "700" },
  itemName: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  itemMeta: { fontSize: 11, marginTop: 2 },
});

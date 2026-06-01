import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
  DriveItem,
  formatSize,
  isFolder,
  isVideo,
  listFolderAll,
  parseEpisodeInfo,
} from "@/lib/gdrive-index";

type BreadcrumbItem = { label: string; drive: 0 | 1; path: string };

const RED = "#e50914";

export default function DriveScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ drive?: string; folderPath?: string; folderLabel?: string }>();

  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [items, setItems] = useState<DriveItem[]>([]);
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
    if (breadcrumbs.length === 0) return;
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

  // Auto-navigate when arriving from detail screen with a folder deep-link
  useEffect(() => {
    const driveParam = params.drive;
    const pathParam = params.folderPath;
    const labelParam = params.folderLabel;
    if (!driveParam || !pathParam) return;
    const driveNum = parseInt(driveParam, 10) as 0 | 1;
    if (driveNum !== 0 && driveNum !== 1) return;
    const label = labelParam || pathParam.split("/").pop() || pathParam;
    setBreadcrumbs([{ label, drive: driveNum, path: pathParam }]);
    fetchFolder(driveNum, pathParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.drive, params.folderPath]);

  const handleItemPress = useCallback(
    (item: DriveItem) => {
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
              siblings.map((s) => ({ name: s.name, link: s.link ?? "" }))
            ),
            currentIndex: String(siblings.findIndex((s) => s.id === item.id)),
          },
        });
      }
    },
    [activeDrive, activePath, navigateTo, items, router]
  );

  const filtered = search.trim()
    ? items.filter((it) => it.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const isRoot = breadcrumbs.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {!isRoot && (
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Feather name="chevron-left" size={26} color="#fff" />
          </TouchableOpacity>
        )}
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isRoot
              ? "🎬 Acervo"
              : breadcrumbs[breadcrumbs.length - 1]?.label ?? "Acervo"}
          </Text>
          {!isRoot && activeDrive !== null && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {DRIVE_ROOTS[activeDrive].name}
            </Text>
          )}
        </View>
      </View>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <FlatList
          horizontal
          data={[
            { label: "Início", drive: 0 as const, path: "" },
            ...breadcrumbs,
          ]}
          keyExtractor={(_, i) => String(i)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breadcrumbRow}
          renderItem={({ item: crumb, index }) => (
            <TouchableOpacity
              onPress={() => jumpToCrumb(index)}
              style={styles.crumbBtn}
            >
              <Text
                style={[
                  styles.crumbText,
                  {
                    color:
                      index === breadcrumbs.length
                        ? colors.foreground
                        : colors.mutedForeground,
                    fontWeight:
                      index === breadcrumbs.length ? "700" : "400",
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
            styles.searchBar,
            {
              backgroundColor: colors.card,
              borderColor: colors.border + "60",
            },
          ]}
        >
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
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
        <View style={styles.center}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Carregando conteúdo...
          </Text>
        </View>
      ) : isRoot ? (
        /* ── Drive selection ── */
        <FlatList
          data={DRIVE_ROOTS}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          renderItem={({ item: root }) => (
            <View style={{ marginBottom: 20 }}>
              <View style={styles.driveTitleRow}>
                <Text style={styles.driveEmoji}>{root.icon}</Text>
                <Text style={[styles.driveTitle, { color: colors.foreground }]}>
                  {root.name}
                </Text>
              </View>
              {root.folders.map((folder) => (
                <Pressable
                  key={folder}
                  onPress={() => navigateTo(root.drive, folder, folder)}
                  style={({ pressed }) => [
                    styles.folderCard,
                    {
                      backgroundColor: pressed
                        ? colors.border + "50"
                        : colors.card,
                      borderColor: colors.border + "50",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.folderIconWrap,
                      { backgroundColor: RED + "20" },
                    ]}
                  >
                    <Feather name="folder" size={20} color={RED} />
                  </View>
                  <Text
                    style={[styles.folderName, { color: colors.foreground }]}
                  >
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
              style={[
                styles.heroBanner,
                { backgroundColor: RED + "15", borderColor: RED + "40" },
              ]}
            >
              <Feather name="hard-drive" size={22} color={RED} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroTitle, { color: "#fff" }]}>
                  Acervo Drive
                </Text>
                <Text
                  style={[
                    styles.heroSub,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Animes · Desenhos · Filmes · Séries · Novelas
                </Text>
              </View>
            </View>
          }
        />
      ) : (
        /* ── File / folder listing ── */
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                fetchFolder(activeDrive!, activePath, true)
              }
              tintColor={RED}
            />
          }
          contentContainerStyle={{
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 12,
            paddingTop: 4,
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather
                name="inbox"
                size={40}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                {search
                  ? "Nenhum resultado encontrado"
                  : "Pasta vazia"}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
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
                  styles.itemRow,
                  {
                    backgroundColor: pressed
                      ? colors.border + "40"
                      : colors.card,
                    borderColor: colors.border + "40",
                  },
                ]}
              >
                {/* Icon */}
                <View
                  style={[
                    styles.itemIcon,
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
                    name={
                      folder ? "folder" : video ? "play-circle" : "file"
                    }
                    size={18}
                    color={
                      folder
                        ? RED
                        : video
                        ? "#4ade80"
                        : colors.mutedForeground
                    }
                  />
                </View>

                {/* Info */}
                <View style={{ flex: 1, marginRight: 6 }}>
                  {ep?.season !== undefined && ep?.episode !== undefined && (
                    <View style={styles.epBadgeRow}>
                      <View
                        style={[
                          styles.epBadge,
                          { backgroundColor: RED + "22" },
                        ]}
                      >
                        <Text style={[styles.epBadgeText, { color: RED }]}>
                          S{String(ep.season).padStart(2, "0")}E
                          {String(ep.episode).padStart(2, "0")}
                        </Text>
                      </View>
                    </View>
                  )}
                  <Text
                    style={[styles.itemName, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {displayName}
                  </Text>
                  {!folder && (
                    <Text
                      style={[
                        styles.itemMeta,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {item.fileExtension?.toUpperCase() ?? ""}
                      {item.size ? `  ·  ${formatSize(item.size)}` : ""}
                    </Text>
                  )}
                </View>

                <Feather
                  name={
                    folder
                      ? "chevron-right"
                      : video
                      ? "play"
                      : "download"
                  }
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: { marginRight: 8, padding: 4 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 21, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 11, marginTop: 1 },
  breadcrumbRow: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    alignItems: "center",
  },
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: { fontSize: 14, marginTop: 8 },
  emptyText: { fontSize: 14, textAlign: "center" },
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
  driveTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
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

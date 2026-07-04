import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { api, TMDB_IMG, type TmdbItem } from "@/lib/api";
import { saveContentEdit } from "@/lib/content-edits";

interface EditPosterModalProps {
  visible: boolean;
  onClose: () => void;
  itemKey: string;
  initialTitle: string;
  initialType: "movie" | "series";
  onSaved?: () => void;
}

export function EditPosterModal({
  visible,
  onClose,
  itemKey,
  initialTitle,
  initialType,
  onSaved,
}: EditPosterModalProps) {
  const [query, setQuery] = useState(initialTitle);
  const [mediaType, setMediaType] = useState<"movie" | "tv">(initialType === "series" ? "tv" : "movie");
  const [results, setResults] = useState<TmdbItem[]>([]);
  const [selected, setSelected] = useState<TmdbItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      const data = await api.tmdb.search(query.trim(), mediaType, 1);
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setError("Nenhum resultado encontrado no TMDB.");
      }
    } catch {
      setError("Falha ao buscar no TMDB. Tente novamente.");
    } finally {
      setSearching(false);
    }
  }, [query, mediaType]);

  const handleSave = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const title = selected.title ?? selected.name ?? query;
      const year = Number((selected.release_date ?? selected.first_air_date ?? "").slice(0, 4)) || undefined;
      const edit = await saveContentEdit(itemKey, {
        tmdbId: selected.id,
        tmdbType: mediaType,
        title,
        posterPath: TMDB_IMG(selected.poster_path, "w342") ?? undefined,
        backdropPath: TMDB_IMG(selected.backdrop_path, "w780") ?? undefined,
        overview: selected.overview,
        year,
        rating: Math.round(selected.vote_average * 10) / 10,
      });
      if (edit) {
        onSaved?.();
        onClose();
      } else {
        setError("Não foi possível salvar. Tente novamente.");
      }
    } finally {
      setSaving(false);
    }
  }, [selected, itemKey, mediaType, query, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.header}>
            <Text style={s.title}>Editar cartaz</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <Text style={s.label}>Nome do conteúdo</Text>
          <TextInput
            style={s.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Digite o nome exato no TMDB"
            placeholderTextColor="rgba(255,255,255,0.35)"
            onSubmitEditing={handleSearch}
          />

          <View style={s.typeRow}>
            <TouchableOpacity
              style={[s.typeBtn, mediaType === "movie" && s.typeBtnActive]}
              onPress={() => setMediaType("movie")}
            >
              <Text style={[s.typeText, mediaType === "movie" && s.typeTextActive]}>Filme</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, mediaType === "tv" && s.typeBtnActive]}
              onPress={() => setMediaType("tv")}
            >
              <Text style={[s.typeText, mediaType === "tv" && s.typeTextActive]}>Série</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.searchBtn} onPress={handleSearch} disabled={searching}>
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="search" size={14} color="#fff" />
                <Text style={s.searchBtnText}>Buscar no TMDB</Text>
              </>
            )}
          </TouchableOpacity>

          {error && <Text style={s.error}>{error}</Text>}

          {results.length > 0 && (
            <ScrollView style={s.results} showsVerticalScrollIndicator={false}>
              <View style={s.grid}>
                {results.slice(0, 12).map((r) => {
                  const isSel = selected?.id === r.id;
                  const poster = TMDB_IMG(r.poster_path, "w185");
                  const label = r.title ?? r.name ?? "";
                  const yr = (r.release_date ?? r.first_air_date ?? "").slice(0, 4);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.resultItem, isSel && s.resultItemSelected]}
                      onPress={() => setSelected(r)}
                      activeOpacity={0.8}
                    >
                      {poster ? (
                        <Image source={{ uri: poster }} style={s.resultPoster} contentFit="cover" />
                      ) : (
                        <View style={[s.resultPoster, s.resultPosterEmpty]}>
                          <Feather name="film" size={20} color="#444" />
                        </View>
                      )}
                      {isSel && (
                        <View style={s.checkBadge}>
                          <Feather name="check" size={12} color="#fff" />
                        </View>
                      )}
                      <Text style={s.resultTitle} numberOfLines={2}>{label}</Text>
                      {!!yr && <Text style={s.resultYear}>{yr}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {selected && (
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="save" size={15} color="#fff" />
                  <Text style={s.saveBtnText}>Salvar cartaz e informações</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "85%",
    backgroundColor: "#12101e",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  label: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 14,
    marginBottom: 12,
  },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  typeBtnActive: { backgroundColor: "rgba(229,9,20,0.18)", borderColor: "#e50914" },
  typeText: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700" },
  typeTextActive: { color: "#e50914" },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#e50914",
    borderRadius: 10,
    paddingVertical: 11,
    marginBottom: 8,
  },
  searchBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  error: { color: "#f87171", fontSize: 12, marginTop: 4, marginBottom: 4, textAlign: "center" },
  results: { maxHeight: 320, marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 4 },
  resultItem: {
    width: 92,
    borderRadius: 8,
    padding: 4,
    borderWidth: 2,
    borderColor: "transparent",
  },
  resultItemSelected: { borderColor: "#e50914", backgroundColor: "rgba(229,9,20,0.1)" },
  resultPoster: { width: "100%", height: 120, borderRadius: 6, backgroundColor: "#1a1a26" },
  resultPosterEmpty: { alignItems: "center", justifyContent: "center" },
  checkBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e50914",
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: { color: "#fff", fontSize: 10, fontWeight: "600", marginTop: 4 },
  resultYear: { color: "rgba(255,255,255,0.4)", fontSize: 9, marginTop: 1 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});

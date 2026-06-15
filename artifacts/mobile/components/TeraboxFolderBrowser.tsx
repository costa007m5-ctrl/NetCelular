import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

interface TBItem {
  fsId: string;
  name: string;
  isDir: boolean;
  size: number;
  path: string;
}

export interface TBFolderFile {
  name: string;
  size: number;
  path: string;
  fsId: string;
  folderUrl: string;
}

const TB_COLOR = "#f59e0b";
const RED = "#e50914";

function fmtSize(bytes: number): string {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const FOLDER_INJECT_JS = `
(function() {
  if (window.__tbFolderInit) return;
  window.__tbFolderInit = true;

  function post(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch(e) {}
  }

  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    var prom = origFetch.apply(this, arguments);
    if (url && url.indexOf('/share/list') > -1) {
      prom.then(function(resp) {
        resp.clone().json().then(function(data) {
          post({ type: 'folderList', url: url, data: data });
        }).catch(function(){});
      }).catch(function(){});
    }
    return prom;
  };

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._interceptUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var self = this;
    if (self._interceptUrl && self._interceptUrl.indexOf('/share/list') > -1) {
      self.addEventListener('load', function() {
        try {
          var data = JSON.parse(self.responseText);
          post({ type: 'folderList', url: self._interceptUrl, data: data });
        } catch(e) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  window.__tbFetchDir = function(surl, dir) {
    var apiUrl = '/share/list?app_id=250528&shorturl=' + encodeURIComponent(surl)
      + '&dir=' + encodeURIComponent(dir)
      + '&num=200&page=1&order=name&asc=1&web=1&channel=dubox&clienttype=0';
    fetch(apiUrl).then(function(r) { return r.json(); }).then(function(data) {
      post({ type: 'folderList', url: apiUrl, data: data, requestedDir: dir });
    }).catch(function(e) {
      post({ type: 'folderError', dir: dir, error: e.message || 'fetch failed' });
    });
  };

  post({ type: 'ready' });
})();
true;
`;

interface Props {
  visible: boolean;
  onClose: () => void;
  onFilesSelected: (files: TBFolderFile[]) => void;
  initialUrl?: string;
}

export function TeraboxFolderBrowser({ visible, onClose, onFilesSelected, initialUrl }: Props) {
  const webViewRef = useRef<any>(null);
  const surlRef = useRef("");

  const [urlInput, setUrlInput] = useState(initialUrl ?? "");
  const [folderUrl, setFolderUrl] = useState("");
  const [surl, setSurl] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [navStack, setNavStack] = useState<{ dir: string; name: string }[]>([]);
  const [currentItems, setCurrentItems] = useState<TBItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const extractSurl = (url: string): string | null => {
    const m = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  };

  const normalizeUrl = (url: string) =>
    url
      .replace(/1024terabox\.com/, "1024tera.com")
      .replace(/^https?:\/\/www\.terabox\.com/, "https://1024tera.com")
      .replace(/^https?:\/\/(teraboxapp|terasharelink|4funbox|momerybox)\.com/, "https://1024tera.com");

  const openFolder = () => {
    const extracted = extractSurl(urlInput.trim());
    if (!extracted) {
      setError("Link inválido. Use: https://1024terabox.com/s/XXX");
      return;
    }
    const normalized = normalizeUrl(urlInput.trim());
    surlRef.current = extracted;
    setFolderUrl(normalized);
    setSurl(extracted);
    setError(null);
    setNavStack([]);
    setCurrentItems([]);
    setSelected(new Set());
    setLoading(true);
  };

  const fetchDir = useCallback((dir: string) => {
    if (!webViewRef.current) return;
    setLoading(true);
    setError(null);
    const escaped = dir.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    webViewRef.current.injectJavaScript(
      `window.__tbFetchDir('${surlRef.current}', '${escaped}'); true;`
    );
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === "ready") {
        setTimeout(() => {
          webViewRef.current?.injectJavaScript(
            `window.__tbFetchDir('${surlRef.current}', '/'); true;`
          );
        }, 900);
        return;
      }

      if (msg.type === "folderList") {
        setLoading(false);
        const data = msg.data;

        if (data.errno && data.errno !== 0) {
          const errMap: Record<number, string> = {
            105: "Link inválido ou expirado",
            400210: "Bloqueado — acesse o TeraBox e crie um link de compartilhamento novo",
          };
          setError(errMap[data.errno] ?? `TeraBox erro ${data.errno}`);
          return;
        }

        const list: TBItem[] = (data.list ?? []).map((item: any) => ({
          fsId: String(item.fs_id ?? ""),
          name: item.server_filename ?? item.filename ?? "",
          isDir: item.isdir === 1,
          size: item.size ?? 0,
          path: item.path ?? "",
        }));

        list.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        setCurrentItems(list);
        return;
      }

      if (msg.type === "folderError") {
        setLoading(false);
        setError(msg.error ?? "Erro ao carregar pasta");
        return;
      }
    } catch {}
  }, []);

  const enterFolder = (item: TBItem) => {
    setNavStack(prev => [...prev, { dir: item.path, name: item.name }]);
    fetchDir(item.path);
  };

  const goBack = () => {
    const newStack = navStack.slice(0, -1);
    setNavStack(newStack);
    const targetDir = newStack.length > 0 ? newStack[newStack.length - 1].dir : "/";
    fetchDir(targetDir);
  };

  const goRoot = () => {
    setNavStack([]);
    fetchDir("/");
  };

  const toggleSelect = (item: TBItem) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  };

  const selectAllFiles = () => {
    setSelected(new Set(currentItems.filter(i => !i.isDir).map(i => i.path)));
  };
  const deselectAll = () => setSelected(new Set());

  const handleConfirm = () => {
    const files: TBFolderFile[] = currentItems
      .filter(item => !item.isDir && selected.has(item.path))
      .map(item => ({
        name: item.name,
        size: item.size,
        path: item.path,
        fsId: item.fsId,
        folderUrl,
      }));
    if (files.length === 0) {
      setError("Selecione pelo menos um arquivo");
      return;
    }
    onFilesSelected(files);
    onClose();
  };

  const resetBrowser = () => {
    setFolderUrl("");
    setSurl("");
    surlRef.current = "";
    setNavStack([]);
    setCurrentItems([]);
    setError(null);
    setSelected(new Set());
    setLoading(false);
  };

  const selectedCount = currentItems.filter(i => !i.isDir && selected.has(i.path)).length;
  const fileCount = currentItems.filter(i => !i.isDir).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={onClose} style={s.headerBtn}>
            <Feather name="x" size={20} color="rgba(255,255,255,0.6)" />
          </Pressable>
          <Text style={s.headerTitle}>📁 Pasta TeraBox</Text>
          {selectedCount > 0 && (
            <Pressable onPress={handleConfirm} style={s.confirmBtn}>
              <Text style={s.confirmBtnText}>Adicionar {selectedCount}</Text>
            </Pressable>
          )}
        </View>

        {!folderUrl ? (
          <ScrollView contentContainerStyle={s.inputPhase}>
            <Text style={s.hint}>Cole o link da pasta compartilhada do TeraBox</Text>
            <TextInput
              value={urlInput}
              onChangeText={t => { setUrlInput(t); setError(null); }}
              placeholder="https://1024terabox.com/s/..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              style={s.urlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {error && (
              <View style={s.errorBox}>
                <Feather name="alert-circle" size={13} color="#f87171" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
            <Pressable onPress={openFolder} style={s.openBtn}>
              <Feather name="folder-open" size={16} color="#000" />
              <Text style={s.openBtnText}>Abrir Pasta</Text>
            </Pressable>

            <View style={s.tipCard}>
              <Text style={s.tipTitle}>💡 Como usar</Text>
              <Text style={s.tipText}>
                {"1. No TeraBox, compartilhe a pasta de conteúdo\n"}
                {"2. Cole o link aqui\n"}
                {"3. Navegue pelas subpastas e selecione os episódios/filmes\n"}
                {"4. Toque em Adicionar → preencha o TMDB → Registrar"}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={s.breadcrumb}>
              <Pressable onPress={resetBrowser} style={s.breadcrumbHome} hitSlop={8}>
                <Feather name="home" size={15} color={TB_COLOR} />
              </Pressable>
              {navStack.length > 0 && (
                <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
                  <Feather name="chevron-left" size={16} color="rgba(255,255,255,0.55)" />
                  <Text style={s.backBtnText}>Voltar</Text>
                </Pressable>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <Pressable onPress={goRoot}>
                  <Text style={[s.crumb, navStack.length === 0 && s.crumbActive]}>Raiz</Text>
                </Pressable>
                {navStack.map((n, i) => (
                  <Text key={i} style={s.crumbSep}>
                    {" › "}
                    <Text style={[s.crumb, i === navStack.length - 1 && s.crumbActive]}>{n.name}</Text>
                  </Text>
                ))}
              </ScrollView>
              {fileCount > 0 && (
                <View style={{ flexDirection: "row", gap: 5 }}>
                  <Pressable onPress={selectAllFiles} style={s.selBtn}>
                    <Text style={s.selBtnText}>Todos</Text>
                  </Pressable>
                  {selectedCount > 0 && (
                    <Pressable onPress={deselectAll} style={[s.selBtn, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
                      <Text style={[s.selBtnText, { color: "rgba(255,255,255,0.4)" }]}>Limpar</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {error && (
              <View style={s.errorBoxFull}>
                <Feather name="alert-circle" size={14} color="#f87171" />
                <Text style={[s.errorText, { flex: 1 }]}>{error}</Text>
              </View>
            )}

            {loading ? (
              <View style={s.loadingWrap}>
                <ActivityIndicator size="large" color={TB_COLOR} />
                <Text style={s.loadingText}>Carregando pasta…</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
                {currentItems.length === 0 && !error && (
                  <Text style={s.emptyText}>Pasta vazia</Text>
                )}
                {currentItems.map((item) => {
                  const isFile = !item.isDir;
                  const isSel = isFile && selected.has(item.path);
                  const isVideo = isFile && /\.(mkv|mp4|avi|mov|ts|m4v|wmv|flv|webm)$/i.test(item.name);
                  return (
                    <Pressable
                      key={item.fsId || item.path}
                      onPress={() => item.isDir ? enterFolder(item) : toggleSelect(item)}
                      style={[s.itemRow, isSel && s.itemRowSel]}
                    >
                      <Text style={s.itemIcon}>
                        {item.isDir ? "📁" : isVideo ? "🎬" : "📄"}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[s.itemName, item.isDir && { color: TB_COLOR, fontWeight: "600" }]}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                        {isFile && item.size > 0 && (
                          <Text style={s.itemSize}>{fmtSize(item.size)}</Text>
                        )}
                      </View>
                      {item.isDir ? (
                        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
                      ) : (
                        <View style={[s.checkbox, isSel && s.checkboxSel]}>
                          {isSel && <Feather name="check" size={11} color="#000" />}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {selectedCount > 0 && (
              <View style={s.bottomBar}>
                <Pressable onPress={handleConfirm} style={s.addBtn}>
                  <Feather name="check-circle" size={16} color="#000" />
                  <Text style={s.addBtnText}>
                    Adicionar {selectedCount} arquivo{selectedCount !== 1 ? "s" : ""} à fila
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {folderUrl && WebView ? (
          <View style={{ width: 1, height: 1, overflow: "hidden", position: "absolute", top: -9999, left: -9999 }}>
            <WebView
              ref={webViewRef}
              source={{ uri: folderUrl }}
              injectedJavaScriptBeforeContentLoaded={FOLDER_INJECT_JS}
              onMessage={handleMessage}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36"
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    borderBottomWidth: 1, borderBottomColor: "#181818",
  },
  headerBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 16 },
  confirmBtn: {
    backgroundColor: TB_COLOR, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  confirmBtnText: { color: "#000", fontWeight: "700", fontSize: 13 },
  inputPhase: { padding: 20, gap: 0 },
  hint: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 12 },
  urlInput: {
    backgroundColor: "#181818", borderRadius: 10, padding: 14,
    color: "#fff", fontSize: 14, marginBottom: 12,
    borderWidth: 1, borderColor: "#252525",
  },
  openBtn: {
    backgroundColor: TB_COLOR, borderRadius: 10,
    paddingVertical: 13, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
    marginBottom: 20,
  },
  openBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
  tipCard: {
    backgroundColor: "rgba(245,158,11,0.06)", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.15)",
  },
  tipTitle: { color: TB_COLOR, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  tipText: { color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 20 },
  breadcrumb: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#181818",
    gap: 4, minHeight: 44,
  },
  breadcrumbHome: { padding: 6 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4, paddingHorizontal: 2 },
  backBtnText: { color: "rgba(255,255,255,0.45)", fontSize: 12 },
  crumb: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
  crumbSep: { color: "rgba(255,255,255,0.2)", fontSize: 12 },
  crumbActive: { color: "#fff", fontWeight: "600" },
  selBtn: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 6,
  },
  selBtnText: { color: TB_COLOR, fontSize: 11, fontWeight: "600" },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(229,9,20,0.08)", borderRadius: 8,
    padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.2)",
  },
  errorBoxFull: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(229,9,20,0.08)", borderRadius: 8,
    margin: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.2)",
  },
  errorText: { color: "#f87171", fontSize: 12 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  loadingText: { color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 14 },
  emptyText: { color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 60, fontSize: 14 },
  itemRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, paddingHorizontal: 10, marginBottom: 4,
    backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 9,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.055)",
  },
  itemRowSel: {
    backgroundColor: "rgba(245,158,11,0.1)",
    borderColor: "rgba(245,158,11,0.3)",
  },
  itemIcon: { fontSize: 20, marginRight: 10 },
  itemName: { color: "#fff", fontSize: 13, lineHeight: 18 },
  itemSize: { color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  checkboxSel: { backgroundColor: TB_COLOR, borderColor: TB_COLOR },
  bottomBar: {
    padding: 14, paddingBottom: Platform.OS === "ios" ? 28 : 14,
    borderTopWidth: 1, borderTopColor: "#181818",
  },
  addBtn: {
    backgroundColor: TB_COLOR, borderRadius: 12,
    paddingVertical: 14, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  addBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
});

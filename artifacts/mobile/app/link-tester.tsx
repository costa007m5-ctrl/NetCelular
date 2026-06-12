/**
 * Link Tester — Admin tool
 *
 * 220 estratégias de reprodução para encontrar qual funciona no APK.
 * Cobre todas as combinações possíveis de URL, headers, players e resoluções.
 */
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { getApiBase } from "@/lib/api";

let Video: any = null;
let ResizeMode: any = null;
try { const av = require("expo-av"); Video = av.Video; ResizeMode = av.ResizeMode; } catch {}
let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

const RED = "#e50914";
const CF_WORKER = "https://netplay-stream-proxy.netplay.workers.dev";
const DEFAULT_URL = "https://nixplay.lat/movie/Reis007-vods/Reis12@@/784769.mp4";

const UA = {
  CHROME_WIN:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  CHROME_AND:  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
  CHROME_LIN:  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  CHROME_MAC:  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  SAFARI_IOS:  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  FIREFOX_WIN: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  FIREFOX_AND: "Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0",
  EDGE_WIN:    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  SAMSUNG:     "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  WEBOS_TV:    "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.5 TV Safari/538.1",
  TIZEN_TV:    "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.1 TV Safari/538.1",
  ANDROID_TV:  "Mozilla/5.0 (Linux; Android 9; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
  VLC:         "VLC/3.0.21 LibVLC/3.0.21",
  MPV:         "mpv/0.37.0",
  CURL:        "curl/8.7.1",
  EXOPLAYER:   "ExoPlayerLib/2.19.1 (Linux;Android 14) ExoPlayerLib/2.19.1",
  EMPTY:       "",
};

const FLIX2_HEADERS = {
  "User-Agent": UA.CHROME_WIN,
  "Referer": "https://nixplay.lat/",
  "Origin": "https://nixplay.lat",
  "Accept": "*/*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

type GroupId =
  | "ExoPlayer" | "ExoPlayer-UA" | "ExoPlayer-Hdrs" | "ExoPlayer-URL"
  | "ExoPlayer-Resolve" | "ExoPlayer-Server"
  | "WebView" | "WebView-Players" | "WebView-Fetch" | "WebView-XHR"
  | "WebView-Config" | "WebView-Inject" | "Servidor-API";

type StratType = "exo" | "webview" | "info";
type StrategyStatus = "idle" | "loading" | "ok" | "error";

interface Strategy { id: number; group: GroupId; type: StratType; name: string; desc: string; }
interface TestResult { status: StrategyStatus; message: string; ms?: number; }

const GROUP_COLOR: Record<GroupId, string> = {
  "ExoPlayer": "#3b82f6", "ExoPlayer-UA": "#0284c7", "ExoPlayer-Hdrs": "#06b6d4",
  "ExoPlayer-URL": "#0d9488", "ExoPlayer-Resolve": "#4f46e5", "ExoPlayer-Server": "#7c3aed",
  "WebView": "#8b5cf6", "WebView-Players": "#a21caf", "WebView-Fetch": "#db2777",
  "WebView-XHR": "#e11d48", "WebView-Config": "#ea580c", "WebView-Inject": "#d97706",
  "Servidor-API": "#059669",
};
const GROUP_LABEL: Record<GroupId, string> = {
  "ExoPlayer":         "⚡ ExoPlayer — Básico (1-10)",
  "ExoPlayer-UA":      "⚡ ExoPlayer — User-Agent (21-35)",
  "ExoPlayer-Hdrs":    "⚡ ExoPlayer — Headers (36-55)",
  "ExoPlayer-URL":     "⚡ ExoPlayer — Mutação de URL (56-70)",
  "ExoPlayer-Resolve": "⚡ ExoPlayer — Resolve Redirect (71-95)",
  "ExoPlayer-Server":  "⚡ ExoPlayer — Server-Side (96-110)",
  "WebView":           "🌐 WebView — Básico (11-20)",
  "WebView-Players":   "🌐 WebView — Players CDN (111-130)",
  "WebView-Fetch":     "🌐 WebView — Fetch API (131-160)",
  "WebView-XHR":       "🌐 WebView — XMLHttpRequest (161-170)",
  "WebView-Config":    "🌐 WebView — Configurações (176-200)",
  "WebView-Inject":    "🌐 WebView — Header Injection (201-215)",
  "Servidor-API":      "🖥️ Servidor — API Routes (216-220)",
};
const GROUP_ORDER: GroupId[] = [
  "ExoPlayer", "ExoPlayer-UA", "ExoPlayer-Hdrs", "ExoPlayer-URL",
  "ExoPlayer-Resolve", "ExoPlayer-Server",
  "WebView", "WebView-Players", "WebView-Fetch", "WebView-XHR",
  "WebView-Config", "WebView-Inject", "Servidor-API",
];

const S = (id: number, group: GroupId, type: StratType, name: string, desc: string): Strategy =>
  ({ id, group, type, name, desc });

const STRATEGIES: Strategy[] = [
  // ── ExoPlayer Básico (1-10) ─────────────────────────────────────────────────
  S(1,  "ExoPlayer", "exo",  "Sem headers",             "URL bruta, sem nenhum header customizado"),
  S(2,  "ExoPlayer", "exo",  "UA Chrome Windows",       "User-Agent: Chrome 124 desktop Windows"),
  S(3,  "ExoPlayer", "exo",  "UA Chrome Android",       "User-Agent: Chrome 124 Android mobile"),
  S(4,  "ExoPlayer", "exo",  "UA Safari iOS",           "User-Agent: Safari iOS 17"),
  S(5,  "ExoPlayer", "exo",  "Headers Flix2 completo",  "UA + Referer nixplay.lat + Origin + Accept"),
  S(6,  "ExoPlayer", "exo",  "CF Worker ★",             "URL → CF Worker (resolve+proxy — MELHOR OPÇÃO)"),
  S(7,  "ExoPlayer", "exo",  "HEAD → Location direto",  "Resolve 302 via HEAD, ExoPlayer sem headers"),
  S(8,  "ExoPlayer", "exo",  "HEAD → http:// → CF",     "Resolve; se http:// → CF Worker URL original"),
  S(9,  "ExoPlayer", "exo",  "@@ → %40%40",             "Substitui @@ por %40%40 na URL"),
  S(10, "ExoPlayer", "exo",  "Ext .m3u8 (HLS force)",   "overrideFileExtensionAndroid: m3u8"),
  // ── ExoPlayer UA (21-35) ────────────────────────────────────────────────────
  S(21, "ExoPlayer-UA", "exo", "UA Firefox Windows",    "Firefox/125.0 Windows desktop"),
  S(22, "ExoPlayer-UA", "exo", "UA Firefox Android",    "Firefox/124.0 Android mobile"),
  S(23, "ExoPlayer-UA", "exo", "UA Edge Windows",       "Edge/124 (Chromium) Windows"),
  S(24, "ExoPlayer-UA", "exo", "UA Chrome Linux",       "Chrome/124 Linux desktop"),
  S(25, "ExoPlayer-UA", "exo", "UA Chrome MacOS",       "Chrome/124 macOS (Macintosh)"),
  S(26, "ExoPlayer-UA", "exo", "UA Samsung Browser",    "SamsungBrowser/25 Android"),
  S(27, "ExoPlayer-UA", "exo", "UA Smart TV WebOS",     "LG SMART-TV Tizen 6.5"),
  S(28, "ExoPlayer-UA", "exo", "UA Smart TV Tizen",     "Samsung SMART-TV Tizen"),
  S(29, "ExoPlayer-UA", "exo", "UA Android TV",         "SHIELD Android TV Chrome/74"),
  S(30, "ExoPlayer-UA", "exo", "UA VLC",                "VLC/3.0.21 LibVLC"),
  S(31, "ExoPlayer-UA", "exo", "UA MPV",                "mpv/0.37.0"),
  S(32, "ExoPlayer-UA", "exo", "UA cURL",               "curl/8.7.1 — mínimo possível"),
  S(33, "ExoPlayer-UA", "exo", "UA vazio (sem UA)",     "User-Agent: string vazia"),
  S(34, "ExoPlayer-UA", "exo", "UA ExoPlayer lib",      "ExoPlayerLib/2.19.1 Android 14"),
  S(35, "ExoPlayer-UA", "exo", "UA Chrome Win+Flix2",   "Chrome Win + Referer + Origin + Accept"),
  // ── ExoPlayer Headers (36-55) ───────────────────────────────────────────────
  S(36, "ExoPlayer-Hdrs", "exo", "Só Referer nixplay",    "Apenas Referer: https://nixplay.lat/"),
  S(37, "ExoPlayer-Hdrs", "exo", "Só Origin nixplay",     "Apenas Origin: https://nixplay.lat"),
  S(38, "ExoPlayer-Hdrs", "exo", "Referer+Origin s/UA",   "Referer e Origin, sem User-Agent"),
  S(39, "ExoPlayer-Hdrs", "exo", "UA+Ref fontedecanais",  "Referer: http://fontedecanais.me"),
  S(40, "ExoPlayer-Hdrs", "exo", "UA+Ref CDN 72yrci",     "Referer: http://www-fontedecanais-me.72yrci50ppqp71.com"),
  S(41, "ExoPlayer-Hdrs", "exo", "Accept: video/mp4",     "UA + Accept: video/mp4,video/*;q=0.9"),
  S(42, "ExoPlayer-Hdrs", "exo", "Accept-Encoding: id",   "UA + Accept-Encoding: identity"),
  S(43, "ExoPlayer-Hdrs", "exo", "Cache-Control: no-cache","UA+Flix2+Cache-Control: no-cache"),
  S(44, "ExoPlayer-Hdrs", "exo", "Pragma: no-cache",      "UA+Flix2+Pragma: no-cache"),
  S(45, "ExoPlayer-Hdrs", "exo", "Connection: keep-alive","UA+Flix2+Connection: keep-alive"),
  S(46, "ExoPlayer-Hdrs", "exo", "X-Forwarded-For: CF",   "Fingir IP Cloudflare (1.1.1.1)"),
  S(47, "ExoPlayer-Hdrs", "exo", "X-Real-IP: CF IP",      "X-Real-IP: 1.1.1.1 (Cloudflare)"),
  S(48, "ExoPlayer-Hdrs", "exo", "Sec-Fetch-Dest: video", "UA+Sec-Fetch-Dest: video"),
  S(49, "ExoPlayer-Hdrs", "exo", "Sec-Fetch completo",    "Sec-Fetch-Dest/Mode/Site como browser"),
  S(50, "ExoPlayer-Hdrs", "exo", "Range: bytes=0-",       "UA+Flix2+Range: bytes=0- (streaming)"),
  S(51, "ExoPlayer-Hdrs", "exo", "Headers browser real",  "Todos headers que Chrome envia num video"),
  S(52, "ExoPlayer-Hdrs", "exo", "TE: trailers",          "UA+Flix2+TE: trailers"),
  S(53, "ExoPlayer-Hdrs", "exo", "Accept-Language pt-BR", "UA+Flix2+Accept-Language: pt-BR"),
  S(54, "ExoPlayer-Hdrs", "exo", "Só Accept: */*",        "Mínimo: apenas Accept: */*"),
  S(55, "ExoPlayer-Hdrs", "exo", "Via: cloudflare fake",  "Via: 1.1 cloudflare (fingir proxy CF)"),
  // ── ExoPlayer URL mutations (56-70) ─────────────────────────────────────────
  S(56, "ExoPlayer-URL", "exo", "@@ → %40%40",           "Encode @@ como %40%40"),
  S(57, "ExoPlayer-URL", "exo", "@@ → %2540%2540",       "Double-encode @@ (%2540%2540)"),
  S(58, "ExoPlayer-URL", "exo", "URL lowercase",          "Converter toda URL para minúsculo"),
  S(59, "ExoPlayer-URL", "exo", "?t=timestamp",           "Adicionar ?t=<timestamp> cache bust"),
  S(60, "ExoPlayer-URL", "exo", "Sem extensão .mp4",      "Remover .mp4 do final"),
  S(61, "ExoPlayer-URL", "exo", "Extensão .ts",           "Trocar .mp4 por .ts (MPEG-TS)"),
  S(62, "ExoPlayer-URL", "exo", "Extensão .mkv",          "Trocar .mp4 por .mkv"),
  S(63, "ExoPlayer-URL", "exo", "Port 80 explícito",      "nixplay.lat:80/movie/..."),
  S(64, "ExoPlayer-URL", "exo", "http:// (não https)",    "Trocar https:// por http://"),
  S(65, "ExoPlayer-URL", "exo", "@@ → @ simples",         "Trocar @@ por @ (um só)"),
  S(66, "ExoPlayer-URL", "exo", "@@ → %40%40 + Flix2 hdr","@@ encoded + headers Flix2 completo"),
  S(67, "ExoPlayer-URL", "exo", "URL + &start=0",         "Adicionar &start=0 ao final"),
  S(68, "ExoPlayer-URL", "exo", "Trailing slash",          "Adicionar / ao final da URL"),
  S(69, "ExoPlayer-URL", "exo", "CF Worker + %40%40 URL", "CF Worker com @@ → %40%40 na URL"),
  S(70, "ExoPlayer-URL", "exo", "CF Worker + http:// URL","CF Worker com URL http:// em vez de https"),
  // ── ExoPlayer Resolve (71-95) ────────────────────────────────────────────────
  S(71, "ExoPlayer-Resolve", "exo", "HEAD→Loc exo s/hdr",   "Resolve 302 HEAD, ExoPlayer sem headers"),
  S(72, "ExoPlayer-Resolve", "exo", "HEAD→Loc exo c/hdr",   "Resolve 302 HEAD, ExoPlayer com Flix2 headers"),
  S(73, "ExoPlayer-Resolve", "exo", "GET follow→resp.url",  "GET redirect:follow → URL final (resp.url)"),
  S(74, "ExoPlayer-Resolve", "exo", "GET Range:0-0→url",    "GET bytes=0-0 + headers → resp.url"),
  S(75, "ExoPlayer-Resolve", "exo", "GET Range:0-1→url",    "GET bytes=0-1 + headers → resp.url"),
  S(76, "ExoPlayer-Resolve", "exo", "GET Range:0-99→url",   "GET bytes=0-99 + headers → resp.url"),
  S(77, "ExoPlayer-Resolve", "exo", "HEAD UA Firefox→Loc",  "HEAD com UA Firefox Windows → Location"),
  S(78, "ExoPlayer-Resolve", "exo", "HEAD UA Edge→Loc",     "HEAD com UA Edge Windows → Location"),
  S(79, "ExoPlayer-Resolve", "exo", "HEAD UA Samsung→Loc",  "HEAD com UA Samsung Browser → Location"),
  S(80, "ExoPlayer-Resolve", "exo", "HEAD sem Referer→Loc", "HEAD apenas UA, sem Referer/Origin"),
  S(81, "ExoPlayer-Resolve", "exo", "HEAD sem UA→Loc",      "HEAD apenas Referer, sem User-Agent"),
  S(82, "ExoPlayer-Resolve", "exo", "HEAD 3x retry→Loc",    "3 tentativas HEAD → primeiro Location"),
  S(83, "ExoPlayer-Resolve", "exo", "★ HEAD http://→CF(ORIG)","★ Se http://, CF Worker com nixplay ORIGINAL"),
  S(84, "ExoPlayer-Resolve", "exo", "HEAD http://→CF(RESOL)","Se http://, CF Worker com URL resolvida"),
  S(85, "ExoPlayer-Resolve", "exo", "Sempre CF(ORIG)",       "Ignora Location, CF Worker com nixplay URL"),
  S(86, "ExoPlayer-Resolve", "exo", "HEAD→Loc→CF(LOC)",      "Resolve Location → CF Worker com resolvida"),
  S(87, "ExoPlayer-Resolve", "exo", "GET→resp.url→CF",       "GET follow → resp.url → CF Worker"),
  S(88, "ExoPlayer-Resolve", "exo", "GET→resp.url exo s/hdr","GET follow → resp.url → ExoPlayer s/hdr"),
  S(89, "ExoPlayer-Resolve", "exo", "GET→resp.url exo c/hdr","GET follow → resp.url → ExoPlayer c/hdr"),
  S(90, "ExoPlayer-Resolve", "exo", "HEAD timeout 3s",       "HEAD com timeout 3s (resposta rápida)"),
  S(91, "ExoPlayer-Resolve", "exo", "HEAD timeout 20s",      "HEAD com timeout 20s (espera mais)"),
  S(92, "ExoPlayer-Resolve", "exo", "Duplo resolve",         "Resolve Location, depois resolve de novo"),
  S(93, "ExoPlayer-Resolve", "exo", "HEAD sem hdrs→CF(ORIG)","HEAD sem headers → se 3xx → CF(ORIG)"),
  S(94, "ExoPlayer-Resolve", "exo", "HEAD UA VLC→Loc",       "HEAD com UA VLC → Location → exo"),
  S(95, "ExoPlayer-Resolve", "exo", "HEAD UA TV→CF(ORIG)",   "HEAD UA Android TV → sempre CF(ORIG)"),
  // ── ExoPlayer Server-side (96-110) ──────────────────────────────────────────
  S(96,  "ExoPlayer-Server", "exo",  "★ API/stream-url→exo",  "★ GET /api/flix2/stream-url → ExoPlayer"),
  S(97,  "ExoPlayer-Server", "exo",  "API/stream-url c/hdr",  "GET /stream-url → ExoPlayer+Flix2 headers"),
  S(98,  "ExoPlayer-Server", "exo",  "★ API fd→CF(ORIG)",     "★ /stream-url via=fontedecanais → CF(nixplay)"),
  S(99,  "ExoPlayer-Server", "exo",  "API nocache=1",         "GET /stream-url?nocache=1 → ExoPlayer"),
  S(100, "ExoPlayer-Server", "info", "API /debug-url (info)", "Mostra redirect chain completo (sem play)"),
  S(101, "ExoPlayer-Server", "exo",  "API auto-rota via CDN", "Se via=fontedecanais/72yrci → CF(ORIG)"),
  S(102, "ExoPlayer-Server", "exo",  "CF Worker HEAD→Loc exo","HEAD request ao CF Worker → Location → exo"),
  S(103, "ExoPlayer-Server", "exo",  "CF Worker + %40%40",    "CF Worker com @@ → %40%40 na URL"),
  S(104, "ExoPlayer-Server", "exo",  "CF Worker + ext .mp4",  "CF Worker URL + overrideFileExtension mp4"),
  S(105, "ExoPlayer-Server", "info", "IP servidor (info)",    "Mostra IP público do servidor Replit"),
  S(106, "ExoPlayer-Server", "info", "Cache warm-status",     "Mostra status do cache Flix2"),
  S(107, "ExoPlayer-Server", "exo",  "API resolve→CF(ORIG)",  "API resolve + CF Worker com nixplay URL"),
  S(108, "ExoPlayer-Server", "exo",  "CF Worker UA Firefox",  "CF Worker URL + UA Firefox no ExoPlayer"),
  S(109, "ExoPlayer-Server", "exo",  "CF Worker UA Samsung",  "CF Worker URL + UA Samsung Browser"),
  S(110, "ExoPlayer-Server", "exo",  "CF Worker+Flix2 hdrs",  "CF Worker URL + todos headers Flix2"),
  // ── WebView Básico (11-20) ──────────────────────────────────────────────────
  S(11, "WebView", "webview", "src direto",              "v.src = url; v.play() — sem headers"),
  S(12, "WebView", "webview", "CF Worker",               "v.src = CF Worker URL (proxy HTTPS)"),
  S(13, "WebView", "webview", "@@ encoded",              "v.src = url com @@ → %40%40"),
  S(14, "WebView", "webview", "fetch+blob (com hdr)",    "fetch com headers → blob → createObjectURL"),
  S(15, "WebView", "webview", "fetch+blob (sem hdr)",    "fetch sem headers → blob → createObjectURL"),
  S(16, "WebView", "webview", "HLS.js (CDN)",            "HLS.js do CDN jsDelivr"),
  S(17, "WebView", "webview", "Video.js (CDN)",          "Video.js universal HTML5 player"),
  S(18, "WebView", "webview", "Shaka Player (CDN)",      "Google Shaka — DASH+HLS+DRM"),
  S(19, "WebView", "webview", "baseUrl vazio",            "WebView sem baseUrl (origem null)"),
  S(20, "WebView", "webview", "HEAD resolve→WebView",    "Resolve redirect manual → Location → v.src"),
  // ── WebView Players CDN (111-130) ───────────────────────────────────────────
  S(111, "WebView-Players", "webview", "Plyr (CDN)",          "Plyr.js — player HTML5 moderno"),
  S(112, "WebView-Players", "webview", "DPlayer (CDN)",        "DPlayer — estilo Bilibili"),
  S(113, "WebView-Players", "webview", "Clappr (CDN)",         "Clappr — player extensível"),
  S(114, "WebView-Players", "webview", "MediaElement.js",      "MediaElement.js multi-browser"),
  S(115, "WebView-Players", "webview", "Fluid Player",         "Fluid Player — leve sem deps"),
  S(116, "WebView-Players", "webview", "OpenPlayerJS",         "OpenPlayerJS — HLS/DASH nativo"),
  S(117, "WebView-Players", "webview", "Video.js+CF Worker",   "Video.js com src = CF Worker URL"),
  S(118, "WebView-Players", "webview", "HLS.js+CF Worker",     "HLS.js tratando CF Worker como HLS"),
  S(119, "WebView-Players", "webview", "Shaka+CF Worker",      "Shaka Player com CF Worker URL"),
  S(120, "WebView-Players", "webview", "Video.js tipo forçado","Video.js type: 'video/mp4' explícito"),
  S(121, "WebView-Players", "webview", "HLS.js+%40%40",        "HLS.js com @@ = %40%40"),
  S(122, "WebView-Players", "webview", "Shaka+%40%40",         "Shaka com @@ = %40%40"),
  S(123, "WebView-Players", "webview", "Plyr+CF Worker",       "Plyr com source = CF Worker URL"),
  S(124, "WebView-Players", "webview", "DPlayer+CF Worker",    "DPlayer com url = CF Worker URL"),
  S(125, "WebView-Players", "webview", "Video simples FS",     "HTML5 video + Fullscreen API auto"),
  S(126, "WebView-Players", "webview", "Video.js UA inject",   "Video.js + XHR override p/ UA"),
  S(127, "WebView-Players", "webview", "HLS.js custom loader", "HLS.js loader customizado+headers"),
  S(128, "WebView-Players", "webview", "Clappr+CF Worker",     "Clappr source = CF Worker URL"),
  S(129, "WebView-Players", "webview", "Player HTML5 puro",    "Video element puro sem framework"),
  S(130, "WebView-Players", "webview", "Plyr+%40%40",          "Plyr com @@ → %40%40"),
  // ── WebView Fetch (131-160) ─────────────────────────────────────────────────
  S(131, "WebView-Fetch", "webview", "fetch HEAD manual→Loc",  "fetch redirect:manual → Location → v.src"),
  S(132, "WebView-Fetch", "webview", "fetch GET follow→url",   "fetch redirect:follow → resp.url → v.src"),
  S(133, "WebView-Fetch", "webview", "fetch HEAD UA Firefox",  "fetch HEAD UA Firefox → Location → v.src"),
  S(134, "WebView-Fetch", "webview", "fetch HEAD UA Samsung",  "fetch HEAD UA Samsung → Location → v.src"),
  S(135, "WebView-Fetch", "webview", "fetch GET Range:0-0",    "fetch GET bytes=0-0 → resp.url → v.src"),
  S(136, "WebView-Fetch", "webview", "fetch GET sem hdr",      "fetch GET sem headers → resp.url → v.src"),
  S(137, "WebView-Fetch", "webview", "fetch HEAD sem Referer", "fetch HEAD só UA, sem Referer"),
  S(138, "WebView-Fetch", "webview", "★ fetch→CF(ORIG)",       "★ Resolve; se http:// → CF Worker(nixplay)"),
  S(139, "WebView-Fetch", "webview", "fetch→CF(RESOL)",        "Resolve → CF Worker com URL resolvida"),
  S(140, "WebView-Fetch", "webview", "fetch CF Worker→url",    "fetch CF Worker → resp.url → v.src"),
  S(141, "WebView-Fetch", "webview", "fetch+blob CF Worker",   "fetch CF Worker → blob → ObjectURL"),
  S(142, "WebView-Fetch", "webview", "fetch+ArrayBuffer→blob", "fetch → arrayBuffer → Blob → v.src"),
  S(143, "WebView-Fetch", "webview", "fetch mode:no-cors",     "fetch mode:no-cors (opaque response)"),
  S(144, "WebView-Fetch", "webview", "fetch credentials:incl", "fetch credentials:include"),
  S(145, "WebView-Fetch", "webview", "fetch cache:no-store",   "fetch cache:no-store → resp.url"),
  S(146, "WebView-Fetch", "webview", "fetch keepalive:true",   "fetch keepalive:true → resp.url"),
  S(147, "WebView-Fetch", "webview", "fetch race orig vs CF",  "Promise.race: orig vs CF → mais rápido"),
  S(148, "WebView-Fetch", "webview", "fetch seq orig→CF→svr",  "Tenta orig, falha→CF, falha→server"),
  S(149, "WebView-Fetch", "webview", "fetch + Content-Type",   "HEAD → verifica Content-Type antes play"),
  S(150, "WebView-Fetch", "webview", "fetch + Accept-Ranges",  "HEAD → verifica Accept-Ranges suporte"),
  S(151, "WebView-Fetch", "webview", "fetch timeout 5s",       "fetch AbortController timeout 5s"),
  S(152, "WebView-Fetch", "webview", "fetch timeout 15s",      "fetch AbortController timeout 15s"),
  S(153, "WebView-Fetch", "webview", "fetch retry 3x backoff", "fetch retry 3x com backoff exponencial"),
  S(154, "WebView-Fetch", "webview", "fetch mostrar headers",  "Exibe todos headers da resposta"),
  S(155, "WebView-Fetch", "webview", "fetch decode token",     "Extrai e mostra token do URL resolvido"),
  S(156, "WebView-Fetch", "webview", "fetch HEAD UA Android TV","UA Android TV Shield → Location"),
  S(157, "WebView-Fetch", "webview", "fetch GET UA VLC",       "UA VLC/3.0.21 → resp.url → v.src"),
  S(158, "WebView-Fetch", "webview", "fetch GET UA cURL",      "UA curl/8.7.1 → resp.url → v.src"),
  S(159, "WebView-Fetch", "webview", "fetch parallel 3 UAs",   "3 fetch paralelas (Chrome/Firefox/VLC)"),
  S(160, "WebView-Fetch", "webview", "fetch /api resolve",     "fetch servidor /api/flix2/stream-url → v.src"),
  // ── WebView XHR (161-170) ───────────────────────────────────────────────────
  S(161, "WebView-XHR", "webview", "XHR GET→responseURL",    "XMLHttpRequest GET → responseURL → v.src"),
  S(162, "WebView-XHR", "webview", "XHR HEAD→location hdr",  "XHR HEAD → getResponseHeader location"),
  S(163, "WebView-XHR", "webview", "XHR withCredentials",    "XHR withCredentials=true → responseURL"),
  S(164, "WebView-XHR", "webview", "XHR arraybuffer→blob",   "XHR arraybuffer → Blob → ObjectURL"),
  S(165, "WebView-XHR", "webview", "XHR timeout 5000ms",     "XHR timeout 5000ms → responseURL"),
  S(166, "WebView-XHR", "webview", "XHR CF Worker→url",      "XHR para CF Worker → responseURL"),
  S(167, "WebView-XHR", "webview", "XHR+Referer header",     "XHR setRequestHeader Referer"),
  S(168, "WebView-XHR", "webview", "XHR getAllHeaders",       "Exibe todos headers de resposta XHR"),
  S(169, "WebView-XHR", "webview", "XHR Range:0-0→url",      "XHR GET Range:bytes=0-0 → responseURL"),
  S(170, "WebView-XHR", "webview", "XHR seq orig→CF",        "XHR orig falhou → XHR CF Worker"),
  // ── WebView Config (176-200) ─────────────────────────────────────────────────
  S(176, "WebView-Config", "webview", "source.uri direto",       "WebView source={{uri:url}} (não HTML)"),
  S(177, "WebView-Config", "webview", "source.uri CF Worker",    "WebView source={{uri: CF Worker URL}}"),
  S(178, "WebView-Config", "webview", "baseUrl=fontedecanais CDN","baseUrl=http://www-fontedecanais-me.72yrci50ppqp71.com"),
  S(179, "WebView-Config", "webview", "baseUrl=cineveo.lat",     "baseUrl=https://cineveo.lat"),
  S(180, "WebView-Config", "webview", "baseUrl=fontedecanais.me","baseUrl=https://fontedecanais.me"),
  S(181, "WebView-Config", "webview", "UA Samsung Browser",      "WebView userAgent=SamsungBrowser/25"),
  S(182, "WebView-Config", "webview", "UA Firefox Android",      "WebView userAgent=Firefox/124 Android"),
  S(183, "WebView-Config", "webview", "UA Chrome Android",       "WebView userAgent=Chrome/124 Android"),
  S(184, "WebView-Config", "webview", "UA Smart TV Tizen",       "WebView userAgent=Samsung SMART-TV"),
  S(185, "WebView-Config", "webview", "Sem userAgent custom",    "WebView sem userAgent (padrão sistema)"),
  S(186, "WebView-Config", "webview", "sharedCookiesEnabled",    "WebView sharedCookiesEnabled=true"),
  S(187, "WebView-Config", "webview", "thirdPartyCookies",       "WebView thirdPartyCookiesEnabled=true"),
  S(188, "WebView-Config", "webview", "allowsProtected=false",   "WebView allowsProtectedMedia=false"),
  S(189, "WebView-Config", "webview", "iframe embed",            "iframe com src=url (não video element)"),
  S(190, "WebView-Config", "webview", "object element",          "<object data=url type=video/mp4>"),
  S(191, "WebView-Config", "webview", "múltiplos source",        "Fallbacks: mp4, webm, ogg"),
  S(192, "WebView-Config", "webview", "crossOrigin=anonymous",   "video.crossOrigin='anonymous'"),
  S(193, "WebView-Config", "webview", "crossOrigin=credentials", "video.crossOrigin='use-credentials'"),
  S(194, "WebView-Config", "webview", "preload=none",            "video preload='none'"),
  S(195, "WebView-Config", "webview", "preload=metadata",        "video preload='metadata'"),
  S(196, "WebView-Config", "webview", "autoplay muted=false",    "muted=false + autoplay inline"),
  S(197, "WebView-Config", "webview", "inline+FS API",           "playsinline + requestFullscreen() auto"),
  S(198, "WebView-Config", "webview", "CF Worker+baseUrl fonte", "CF Worker URL + baseUrl=fontedecanais CDN"),
  S(199, "WebView-Config", "webview", "CF Worker+UA Samsung",    "CF Worker URL + WebView UA Samsung"),
  S(200, "WebView-Config", "webview", "Server resolve→WebView",  "Resolve via /api/stream-url → v.src WebView"),
  // ── WebView Inject (201-215) ─────────────────────────────────────────────────
  S(201, "WebView-Inject", "webview", "Override fetch+hdrs",     "Monkey-patch fetch p/ injetar headers auto"),
  S(202, "WebView-Inject", "webview", "Override XHR+headers",    "Monkey-patch XHR.open+setRequestHeader"),
  S(203, "WebView-Inject", "webview", "Meta Referer http-equiv", "<meta http-equiv=Referer nixplay.lat>"),
  S(204, "WebView-Inject", "webview", "URL user:pass@host",       "Credenciais embedded na URL"),
  S(205, "WebView-Inject", "webview", "Headers() object",         "new Headers() explícito → fetch → v.src"),
  S(206, "WebView-Inject", "webview", "Request.clone+headers",    "new Request(url,{headers}) → fetch"),
  S(207, "WebView-Inject", "webview", "postMessage Location",     "fetch resolve → postMessage URL → v.src"),
  S(208, "WebView-Inject", "webview", "Cookie inject",            "document.cookie antes do request"),
  S(209, "WebView-Inject", "webview", "Mostrar resp.headers",     "Exibe TODOS headers da resposta resolve"),
  S(210, "WebView-Inject", "webview", "Auto-detectar CDN",        "Detecta cineveo/fontedecanais, aplica rota certa"),
  S(211, "WebView-Inject", "webview", "Decode token fontecan",    "Extrai e mostra token Base64 do URL resolvido"),
  S(212, "WebView-Inject", "webview", "location.href redirect",   "Resolve Location → seta location.href"),
  S(213, "WebView-Inject", "webview", "ServiceWorker test",       "Tenta registrar SW para interceptar requests"),
  S(214, "WebView-Inject", "webview", "Range seek test CF",       "Testa Range support CF Worker (bytes=0-100KB)"),
  S(215, "WebView-Inject", "webview", "Parallel UAs→vencedor",    "3 UAs paralelas → primeiro que resolver"),
  // ── Servidor API (216-220) ────────────────────────────────────────────────────
  S(216, "Servidor-API", "info", "API /stream-url→mostrar URL",   "Mostra URL+via resolvida pelo servidor"),
  S(217, "Servidor-API", "info", "API /debug-url→chain",          "Mostra redirect chain completo via servidor"),
  S(218, "Servidor-API", "info", "TTFB CF Worker",                "Mede Time To First Byte do CF Worker"),
  S(219, "Servidor-API", "info", "Range test CF Worker",          "Verifica Range support no CF Worker"),
  S(220, "Servidor-API", "info", "Auto-test ★6+83+98 paralelo",  "Roda estratégias mais promissoras juntas"),
];

// ── WebView HTML builder ──────────────────────────────────────────────────────
function buildWebViewHtml(url: string, stratId: number, apiBase?: string): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/`/g, "\\`");
  const u = esc(url);
  const cfUrl = `${CF_WORKER}/?url=${encodeURIComponent(url)}`;
  const cfEsc = esc(cfUrl);
  const aaUrl = url.replace(/@@/g, "%40%40");
  const aaEsc = esc(aaUrl);
  const ua = { ...UA };
  const hdrs = JSON.stringify(FLIX2_HEADERS);

  const base = (script: string, extraHead = "") =>
    `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
    ${extraHead}
    <style>*{margin:0;padding:0;box-sizing:border-box;background:#000}html,body{width:100%;height:100%;overflow:hidden}
    video,iframe{width:100%;height:100%;object-fit:contain;display:block}
    #info{position:absolute;top:0;left:0;right:0;padding:8px;background:rgba(0,0,0,0.8);color:#0f0;font:10px monospace;z-index:99;word-break:break-all;max-height:60%;overflow:auto}
    </style></head><body>
    <video id="v" playsinline webkit-playsinline preload="auto"></video>
    <div id="info" style="display:none"></div>
    <script>(function(){
      var v=document.getElementById('v'),info=document.getElementById('info');
      var rn=window.ReactNativeWebView;
      function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}
      function showInfo(t){info.style.display='block';info.textContent=t;send({type:'info',message:t});}
      var t0=Date.now();
      v.addEventListener('loadedmetadata',function(){send({type:'ready',ms:Date.now()-t0,duration:v.duration*1000});});
      v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});
      v.addEventListener('error',function(){
        var code=v.error?v.error.code:-1,msg=v.error?(v.error.message||'code:'+code):'unknown';
        send({type:'error',message:'MEDIA_ELEMENT_ERROR: '+msg});
      });
      ${script}
    })();</script></body></html>`;

  // ── Basic WebView (11-20) ───────────────────────────────────────────────────
  if (stratId === 11) return base(`v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 12) return base(`v.src='${cfEsc}';v.load();v.play().catch(function(){});`);
  if (stratId === 13) return base(`v.src='${aaEsc}';v.load();v.play().catch(function(){});`);
  if (stratId === 14) return base(`fetch('${u}',{headers:${hdrs}}).then(function(r){return r.blob();}).then(function(b){v.src=URL.createObjectURL(b);v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch+blob: '+String(e)});});`);
  if (stratId === 15) return base(`fetch('${u}').then(function(r){return r.blob();}).then(function(b){v.src=URL.createObjectURL(b);v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch+blob(no-hdr): '+String(e)});});`);
  if (stratId === 16) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script></head><body><video id="v" playsinline webkit-playsinline controls autoplay></video><script>var v=document.getElementById('v'),rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();v.addEventListener('error',function(){send({type:'error',message:'HLS.js: '+(v.error?v.error.message:'err')});});v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});if(Hls.isSupported()){var hls=new Hls();hls.loadSource('${u}');hls.attachMedia(v);hls.on(Hls.Events.ERROR,function(e,d){send({type:'error',message:'HLS.js: '+d.details});});}else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src='${u}';v.play();}else{send({type:'error',message:'HLS.js não suportado'});}</script></body></html>`;
  if (stratId === 17) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet"/><style>*{margin:0;padding:0;background:#000}html,body,#v{width:100%;height:100%}.video-js{width:100%;height:100%}</style></head><body><video id="v" class="video-js" playsinline webkit-playsinline controls autoplay><source src="${url}" type="video/mp4"/></video><script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var player=videojs('v',{fluid:false,fill:true,autoplay:true,muted:false});player.on('playing',function(){send({type:'playing',ms:Date.now()-t0});});player.on('error',function(){send({type:'error',message:'Video.js: '+player.error().message});});</script></body></html>`;
  if (stratId === 18) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://ajax.googleapis.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js"></script></head><body><video id="v" playsinline webkit-playsinline autoplay></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();shaka.polyfill.installAll();var v=document.getElementById('v');v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});if(shaka.Player.isBrowserSupported()){var p=new shaka.Player(v);p.load('${u}').then(function(){v.play();}).catch(function(e){send({type:'error',message:'Shaka: '+e.message});});}else{send({type:'error',message:'Shaka: não suportado'});}</script></body></html>`;
  if (stratId === 19) return base(`v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 20) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${hdrs}}).then(function(r){var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('Resolved: '+pu.slice(0,120));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){v.src='${u}';v.load();v.play().catch(function(){});});`);

  // ── WebView Players CDN (111-130) ───────────────────────────────────────────
  if (stratId === 111) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}.plyr{width:100%;height:100%}</style></head><body><video id="v" playsinline autoplay><source src="${url}" type="video/mp4"/></video><script src="https://cdn.plyr.io/3.7.8/plyr.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var pl=new Plyr('#v');pl.on('playing',function(){send({type:'playing',ms:Date.now()-t0});});pl.on('error',function(e){send({type:'error',message:'Plyr: '+String(e)});});</script></body></html>`;
  if (stratId === 112) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.css"/><style>*{margin:0;padding:0;background:#000}html,body,#dp{width:100%;height:100%}</style></head><body><div id="dp"></div><script src="https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var dp=new DPlayer({container:document.getElementById('dp'),video:{url:'${u}',type:'mp4'},autoplay:true});dp.on('play',function(){send({type:'playing',ms:Date.now()-t0});});dp.on('error',function(){send({type:'error',message:'DPlayer error'});});</script></body></html>`;
  if (stratId === 113) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body,#player{width:100%;height:100%}</style><script src="https://cdn.jsdelivr.net/npm/clappr@latest/dist/clappr.min.js"></script></head><body><div id="player"></div><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var p=new Clappr.Player({source:'${u}',parentId:'#player',width:'100%',height:'100%',autoPlay:true});p.on(Clappr.Events.PLAYER_PLAY,function(){send({type:'playing',ms:Date.now()-t0});});p.on(Clappr.Events.PLAYER_ERROR,function(e){send({type:'error',message:'Clappr: '+String(e)});});</script></body></html>`;
  if (stratId === 114) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mediaelement/build/mediaelementplayer.min.css"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%}</style></head><body><video id="v" src="${url}" autoplay playsinline controls></video><script src="https://cdn.jsdelivr.net/npm/mediaelement/build/mediaelement-and-player.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();new MediaElementPlayer('v',{success:function(p){p.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});}});</script></body></html>`;
  if (stratId === 115) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="https://cdn.fluidplayer.com/v3/current/fluidplayer.min.css"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style></head><body><video id="v" autoplay playsinline><source src="${url}" type="video/mp4"/></video><script src="https://cdn.fluidplayer.com/v3/current/fluidplayer.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var p=fluidPlayer('v',{layoutControls:{autoPlay:true}});document.getElementById('v').addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});</script></body></html>`;
  if (stratId === 116) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://cdn.jsdelivr.net/npm/openplayerjs@latest/dist/openplayer.min.js"></script></head><body><video id="v" src="${url}" autoplay playsinline controls class="op-player__media"></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();new OpenPlayer('v');document.getElementById('v').addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});</script></body></html>`;
  if (stratId === 117) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet"/><style>*{margin:0;padding:0;background:#000}html,body,#v{width:100%;height:100%}.video-js{width:100%;height:100%}</style></head><body><video id="v" class="video-js" playsinline controls autoplay><source src="${cfUrl}" type="video/mp4"/></video><script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var p=videojs('v',{fill:true,autoplay:true});p.on('playing',function(){send({type:'playing',ms:Date.now()-t0});});p.on('error',function(){send({type:'error',message:'Vjs+CF: '+p.error().message});});</script></body></html>`;
  if (stratId === 118) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script></head><body><video id="v" playsinline autoplay controls></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var v=document.getElementById('v');v.addEventListener('error',function(){send({type:'error',message:'HLS+CF: '+(v.error?v.error.message:'err')});});v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});if(Hls.isSupported()){var hls=new Hls();hls.loadSource('${cfEsc}');hls.attachMedia(v);hls.on(Hls.Events.ERROR,function(e,d){send({type:'error',message:'HLS+CF: '+d.details});});}else{v.src='${cfEsc}';v.play();}</script></body></html>`;
  if (stratId === 119) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://ajax.googleapis.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js"></script></head><body><video id="v" playsinline autoplay></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();shaka.polyfill.installAll();var v=document.getElementById('v');v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});if(shaka.Player.isBrowserSupported()){var p=new shaka.Player(v);p.load('${cfEsc}').then(function(){v.play();}).catch(function(e){send({type:'error',message:'Shaka+CF: '+e.message});});}else{send({type:'error',message:'Shaka: não suportado'});}</script></body></html>`;
  if (stratId === 120) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet"/><style>*{margin:0;padding:0;background:#000}html,body,#v{width:100%;height:100%}.video-js{width:100%;height:100%}</style></head><body><video id="v" class="video-js" playsinline controls autoplay><source src="${url}" type="video/mp4"/></video><script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var p=videojs('v',{fill:true,autoplay:true});p.on('playing',function(){send({type:'playing',ms:Date.now()-t0});});p.on('error',function(){send({type:'error',message:'Vjs mp4-forced: '+p.error().message});});</script></body></html>`;
  if (stratId === 121) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script></head><body><video id="v" playsinline autoplay controls></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var v=document.getElementById('v');v.addEventListener('error',function(){send({type:'error',message:'HLS+aa: '+(v.error?v.error.message:'err')});});v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});if(Hls.isSupported()){var hls=new Hls();hls.loadSource('${aaEsc}');hls.attachMedia(v);}else{v.src='${aaEsc}';v.play();}</script></body></html>`;
  if (stratId === 122) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://ajax.googleapis.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js"></script></head><body><video id="v" playsinline autoplay></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();shaka.polyfill.installAll();var v=document.getElementById('v');v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});if(shaka.Player.isBrowserSupported()){var p=new shaka.Player(v);p.load('${aaEsc}').then(function(){v.play();}).catch(function(e){send({type:'error',message:'Shaka+aa: '+e.message});});}else{send({type:'error',message:'Shaka não suportado'});}</script></body></html>`;
  if (stratId === 123) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}.plyr{width:100%;height:100%}</style></head><body><video id="v" playsinline autoplay><source src="${cfUrl}" type="video/mp4"/></video><script src="https://cdn.plyr.io/3.7.8/plyr.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var pl=new Plyr('#v');pl.on('playing',function(){send({type:'playing',ms:Date.now()-t0});});</script></body></html>`;
  if (stratId === 124) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.css"/><style>*{margin:0;padding:0;background:#000}html,body,#dp{width:100%;height:100%}</style></head><body><div id="dp"></div><script src="https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var dp=new DPlayer({container:document.getElementById('dp'),video:{url:'${cfEsc}',type:'mp4'},autoplay:true});dp.on('play',function(){send({type:'playing',ms:Date.now()-t0});});</script></body></html>`;
  if (stratId === 125) return base(`v.src='${u}';v.load();v.play().then(function(){try{v.requestFullscreen();}catch(e){}}).catch(function(){});`);
  if (stratId === 126) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet"/><style>*{margin:0;padding:0;background:#000}html,body,#v{width:100%;height:100%}.video-js{width:100%;height:100%}</style></head><body><video id="v" class="video-js" playsinline controls autoplay><source src="${url}" type="video/mp4"/></video><script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var origXHR=window.XMLHttpRequest;window.XMLHttpRequest=function(){var x=new origXHR();var origOpen=x.open.bind(x);x.open=function(m,u,a){origOpen(m,u,a);try{x.setRequestHeader('User-Agent','${UA.CHROME_WIN}');}catch(e){}};return x;};var p=videojs('v',{fill:true,autoplay:true});p.on('playing',function(){send({type:'playing',ms:Date.now()-t0});});p.on('error',function(){send({type:'error',message:'VjsUA: '+p.error().message});});</script></body></html>`;
  if (stratId === 127) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script></head><body><video id="v" playsinline autoplay controls></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var v=document.getElementById('v');v.addEventListener('error',function(){send({type:'error',message:'HLS-loader: '+(v.error?v.error.message:'err')});});v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});function CustomLoader(c,s,p){Hls.DefaultConfig.loader.call(this,c,s,p);}CustomLoader.prototype=Object.create(Hls.DefaultConfig.loader.prototype);CustomLoader.prototype.load=function(ctx,cfg,cb){ctx.headers={'User-Agent':'${UA.CHROME_WIN}','Referer':'https://nixplay.lat/','Origin':'https://nixplay.lat'};Hls.DefaultConfig.loader.prototype.load.call(this,ctx,cfg,cb);};if(Hls.isSupported()){var hls=new Hls({loader:CustomLoader});hls.loadSource('${u}');hls.attachMedia(v);}else{v.src='${u}';v.play();}</script></body></html>`;
  if (stratId === 128) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body,#player{width:100%;height:100%}</style><script src="https://cdn.jsdelivr.net/npm/clappr@latest/dist/clappr.min.js"></script></head><body><div id="player"></div><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var p=new Clappr.Player({source:'${cfEsc}',parentId:'#player',width:'100%',height:'100%',autoPlay:true});p.on(Clappr.Events.PLAYER_PLAY,function(){send({type:'playing',ms:Date.now()-t0});});p.on(Clappr.Events.PLAYER_ERROR,function(e){send({type:'error',message:'Clappr+CF: '+String(e)});});</script></body></html>`;
  if (stratId === 129) return base(`v.src='${u}';v.controls=true;v.load();v.play().catch(function(){});`);
  if (stratId === 130) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}.plyr{width:100%;height:100%}</style></head><body><video id="v" playsinline autoplay><source src="${aaUrl}" type="video/mp4"/></video><script src="https://cdn.plyr.io/3.7.8/plyr.js"></script><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var pl=new Plyr('#v');pl.on('playing',function(){send({type:'playing',ms:Date.now()-t0});});</script></body></html>`;

  // ── WebView Fetch (131-160) ─────────────────────────────────────────────────
  const fetchHdrs = `${hdrs}`;
  if (stratId === 131) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location')||r.headers.get('Location');var pu=loc||'${u}';showInfo('Location: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch HEAD manual: '+String(e)});});`);
  if (stratId === 132) return base(`fetch('${u}',{method:'GET',redirect:'follow',headers:${fetchHdrs}}).then(function(r){var pu=r.url||'${u}';showInfo('resp.url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch GET follow: '+String(e)});});`);
  if (stratId === 133) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.FIREFOX_WIN}','Referer':'https://nixplay.lat/','Accept':'*/*'}}).then(function(r){var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('Firefox Location: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch Firefox: '+String(e)});});`);
  if (stratId === 134) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.SAMSUNG}','Referer':'https://nixplay.lat/','Accept':'*/*'}}).then(function(r){var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('Samsung Location: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch Samsung: '+String(e)});});`);
  if (stratId === 135) return base(`fetch('${u}',{method:'GET',redirect:'follow',headers:{'User-Agent':'${UA.CHROME_WIN}','Referer':'https://nixplay.lat/','Range':'bytes=0-0','Accept':'*/*'}}).then(function(r){var pu=r.url||'${u}';showInfo('Range:0-0 url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch Range:0-0: '+String(e)});});`);
  if (stratId === 136) return base(`fetch('${u}',{method:'GET',redirect:'follow'}).then(function(r){var pu=r.url||'${u}';showInfo('no-hdr resp.url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch no-hdr: '+String(e)});});`);
  if (stratId === 137) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.CHROME_WIN}','Accept':'*/*'}}).then(function(r){var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('no-Referer Loc: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch no-Ref: '+String(e)});});`);
  if (stratId === 138) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location');if(loc&&loc.startsWith('http://')){var cf='${cfEsc}';showInfo('★ http:// → CF(ORIG): '+cf.slice(0,80));v.src=cf;v.load();v.play().catch(function(){});}else{var pu=loc||'${u}';showInfo('direct: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}}).catch(function(e){v.src='${cfEsc}';v.load();v.play().catch(function(){});});`);
  if (stratId === 139) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location');if(loc&&(loc.includes('fontedecanais')||loc.includes('72yrci'))){var cf='${CF_WORKER}/?url='+encodeURIComponent(loc);showInfo('→ CF(RESOL): '+cf.slice(0,80));v.src=cf;v.load();v.play().catch(function(){});}else{var pu=loc||'${u}';v.src=pu;v.load();v.play().catch(function(){});}}).catch(function(e){send({type:'error',message:'fetch resolve-CF: '+String(e)});});`);
  if (stratId === 140) return base(`fetch('${cfEsc}',{method:'GET',redirect:'follow',headers:{'Accept':'*/*'}}).then(function(r){var pu=r.url||'${cfEsc}';showInfo('CF resp.url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'fetch CF→url: '+String(e)});});`);
  if (stratId === 141) return base(`fetch('${cfEsc}').then(function(r){return r.blob();}).then(function(b){v.src=URL.createObjectURL(b);v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'CF+blob: '+String(e)});});`);
  if (stratId === 142) return base(`fetch('${u}',{headers:${fetchHdrs}}).then(function(r){return r.arrayBuffer();}).then(function(ab){var b=new Blob([ab],{type:'video/mp4'});v.src=URL.createObjectURL(b);v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'ArrayBuffer: '+String(e)});});`);
  if (stratId === 143) return base(`try{fetch('${u}',{mode:'no-cors'}).then(function(r){showInfo('no-cors type:'+r.type+' url:'+r.url.slice(0,60));v.src='${u}';v.load();v.play().catch(function(){});});}catch(e){send({type:'error',message:'no-cors: '+String(e)});}`, ``);
  if (stratId === 144) return base(`fetch('${u}',{credentials:'include',headers:${fetchHdrs},redirect:'follow'}).then(function(r){var pu=r.url||'${u}';showInfo('creds:incl url:'+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'creds:incl: '+String(e)});});`);
  if (stratId === 145) return base(`fetch('${u}',{cache:'no-store',headers:${fetchHdrs},redirect:'follow'}).then(function(r){var pu=r.url||'${u}';showInfo('no-store: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'no-store: '+String(e)});});`);
  if (stratId === 146) return base(`fetch('${u}',{keepalive:true,headers:${fetchHdrs},redirect:'follow'}).then(function(r){var pu=r.url||'${u}';showInfo('keepalive: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'keepalive: '+String(e)});});`);
  if (stratId === 147) return base(`Promise.race([fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){return r.headers.get('location')||'${u}';}),fetch('${cfEsc}',{redirect:'follow'}).then(function(r){return r.url||'${cfEsc}';})]).then(function(pu){showInfo('race winner: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'race: '+String(e)});});`);
  if (stratId === 148) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location');if(loc){showInfo('orig OK: '+loc.slice(0,80));v.src=loc;v.load();v.play().catch(function(){});}else{return fetch('${cfEsc}',{redirect:'follow'}).then(function(r2){var pu=r2.url||'${cfEsc}';showInfo('CF fallback: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});});}}).catch(function(){fetch('${cfEsc}').then(function(r){v.src=r.url||'${cfEsc}';v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'seq all failed: '+String(e)});});});`);
  if (stratId === 149) return base(`fetch('${u}',{method:'HEAD',redirect:'follow',headers:${fetchHdrs}}).then(function(r){var ct=r.headers.get('content-type')||'unknown';var ar=r.headers.get('accept-ranges')||'none';showInfo('Content-Type: '+ct+' | Accept-Ranges: '+ar);v.src=r.url||'${u}';v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'ct-check: '+String(e)});});`);
  if (stratId === 150) return base(`fetch('${u}',{method:'HEAD',redirect:'follow',headers:${fetchHdrs}}).then(function(r){var ar=r.headers.get('accept-ranges');var cl=r.headers.get('content-length');showInfo('Accept-Ranges: '+ar+' | CL: '+cl+' | URL: '+r.url.slice(0,60));v.src=r.url||'${u}';v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'ar-check: '+String(e)});});`);
  if (stratId === 151) return base(`var ac=new AbortController();var t=setTimeout(function(){ac.abort();},5000);fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs},signal:ac.signal}).then(function(r){clearTimeout(t);var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('5s: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){clearTimeout(t);send({type:'error',message:'timeout5s: '+String(e)});});`);
  if (stratId === 152) return base(`var ac=new AbortController();var t=setTimeout(function(){ac.abort();},15000);fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs},signal:ac.signal}).then(function(r){clearTimeout(t);var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('15s: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){clearTimeout(t);send({type:'error',message:'timeout15s: '+String(e)});});`);
  if (stratId === 153) return base(`(function retry(n,delay){fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location');if(loc){showInfo('retry ok@'+(4-n)+': '+loc.slice(0,80));v.src=loc;v.load();v.play().catch(function(){});}else if(n>1){setTimeout(function(){retry(n-1,delay*2);},delay);}else{v.src='${u}';v.load();v.play().catch(function(){});}}).catch(function(){if(n>1)setTimeout(function(){retry(n-1,delay*2);},delay);else send({type:'error',message:'retry all failed'});});})(3,500);`);
  if (stratId === 154) return base(`fetch('${u}',{method:'HEAD',redirect:'follow',headers:${fetchHdrs}}).then(function(r){var hdrs=[];r.headers.forEach(function(v,k){hdrs.push(k+': '+v);});var info='URL:'+r.url.slice(0,60)+'\\n'+hdrs.join('\\n');showInfo(info);send({type:'info',message:info.slice(0,200)});v.src=r.url||'${u}';v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'hdrs: '+String(e)});});`);
  if (stratId === 155) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location')||'';var tkMatch=loc.match(/token=([^&]+)/);var tk=tkMatch?atob(decodeURIComponent(tkMatch[1]).replace(/-/g,'+').replace(/_/g,'/')).slice(0,60):'no-token';var host=loc?new URL(loc).hostname:'no-host';showInfo('CDN: '+host+'\\nToken(decoded): '+tk+'\\nFull: '+loc.slice(0,120));if(loc){v.src=loc;v.load();v.play().catch(function(){});}}).catch(function(e){send({type:'error',message:'decode: '+String(e)});});`);
  if (stratId === 156) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.ANDROID_TV}','Referer':'https://nixplay.lat/','Accept':'*/*'}}).then(function(r){var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('AndroidTV: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'AndroidTV: '+String(e)});});`);
  if (stratId === 157) return base(`fetch('${u}',{method:'GET',redirect:'follow',headers:{'User-Agent':'${UA.VLC}','Accept':'*/*'}}).then(function(r){var pu=r.url||'${u}';showInfo('VLC resp.url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'VLC: '+String(e)});});`);
  if (stratId === 158) return base(`fetch('${u}',{method:'GET',redirect:'follow',headers:{'User-Agent':'${UA.CURL}','Accept':'*/*'}}).then(function(r){var pu=r.url||'${u}';showInfo('cURL resp.url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'cURL: '+String(e)});});`);
  if (stratId === 159) return base(`Promise.all([fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.CHROME_WIN}','Accept':'*/*'}}).then(function(r){return {ua:'Chrome',loc:r.headers.get('location')||'${u}'};}).catch(function(){return {ua:'Chrome',loc:''};}),fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.FIREFOX_WIN}','Accept':'*/*'}}).then(function(r){return {ua:'Firefox',loc:r.headers.get('location')||'${u}'};}).catch(function(){return {ua:'Firefox',loc:''};}),fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.VLC}','Accept':'*/*'}}).then(function(r){return {ua:'VLC',loc:r.headers.get('location')||'${u}'};}).catch(function(){return {ua:'VLC',loc:''};})]).then(function(results){var info=results.map(function(r){return r.ua+': '+(r.loc?r.loc.slice(0,60):'empty');}).join('\\n');showInfo(info);var winner=results.find(function(r){return r.loc&&r.loc!='${u}';});var pu=winner?winner.loc:'${u}';v.src=pu;v.load();v.play().catch(function(){});});`);
  if (stratId === 160) {
    const api = apiBase ?? "";
    return base(`fetch('${api}/api/flix2/stream-url?streamUrl='+encodeURIComponent('${u}')).then(function(r){return r.json();}).then(function(d){var pu=d.url||'${u}';showInfo('via='+d.via+' url='+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'api-resolve: '+String(e)});});`);
  }

  // ── WebView XHR (161-170) ───────────────────────────────────────────────────
  if (stratId === 161) return base(`var x=new XMLHttpRequest();x.open('GET','${u}',true);x.setRequestHeader('Accept','*/*');x.onreadystatechange=function(){if(x.readyState>=2){var pu=x.responseURL||'${u}';showInfo('XHR GET responseURL: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}};x.send();`);
  if (stratId === 162) return base(`var x=new XMLHttpRequest();x.open('HEAD','${u}',true);x.setRequestHeader('Accept','*/*');x.onreadystatechange=function(){if(x.readyState>=2){var loc=x.getResponseHeader('location')||x.getResponseHeader('Location');if(loc){showInfo('XHR HEAD location: '+loc.slice(0,100));v.src=loc;v.load();v.play().catch(function(){});}}};x.send();`);
  if (stratId === 163) return base(`var x=new XMLHttpRequest();x.open('GET','${u}',true);x.withCredentials=true;x.setRequestHeader('Accept','*/*');x.onreadystatechange=function(){if(x.readyState>=2){var pu=x.responseURL||'${u}';showInfo('XHR withCreds url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}};x.send();`);
  if (stratId === 164) return base(`var x=new XMLHttpRequest();x.open('GET','${u}',true);x.responseType='arraybuffer';x.setRequestHeader('Accept','*/*');x.onload=function(){var b=new Blob([x.response],{type:'video/mp4'});v.src=URL.createObjectURL(b);v.load();v.play().catch(function(){});};x.onerror=function(){send({type:'error',message:'XHR arraybuf error'});};x.send();`);
  if (stratId === 165) return base(`var x=new XMLHttpRequest();x.open('GET','${u}',true);x.timeout=5000;x.setRequestHeader('Accept','*/*');x.ontimeout=function(){send({type:'error',message:'XHR timeout'});};x.onreadystatechange=function(){if(x.readyState>=2){var pu=x.responseURL||'${u}';showInfo('XHR t5000: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}};x.send();`);
  if (stratId === 166) return base(`var x=new XMLHttpRequest();x.open('GET','${cfEsc}',true);x.setRequestHeader('Accept','*/*');x.onreadystatechange=function(){if(x.readyState>=2){var pu=x.responseURL||'${cfEsc}';showInfo('XHR CF url: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}};x.send();`);
  if (stratId === 167) return base(`var x=new XMLHttpRequest();x.open('HEAD','${u}',true);try{x.setRequestHeader('Referer','https://nixplay.lat/');}catch(e){}x.setRequestHeader('Accept','*/*');x.onreadystatechange=function(){if(x.readyState>=2){var loc=x.getResponseHeader('location')||x.responseURL||'${u}';showInfo('XHR+Ref: '+loc.slice(0,100));v.src=loc;v.load();v.play().catch(function(){});}};x.send();`);
  if (stratId === 168) return base(`var x=new XMLHttpRequest();x.open('HEAD','${u}',true);x.setRequestHeader('Accept','*/*');x.onreadystatechange=function(){if(x.readyState===4){var hdrs=x.getAllResponseHeaders();showInfo('XHR headers:\\n'+hdrs.slice(0,200));var loc=x.getResponseHeader('location')||x.responseURL||'${u}';v.src=loc;v.load();v.play().catch(function(){});}};x.send();`);
  if (stratId === 169) return base(`var x=new XMLHttpRequest();x.open('GET','${u}',true);x.setRequestHeader('Range','bytes=0-0');x.setRequestHeader('Accept','*/*');x.onreadystatechange=function(){if(x.readyState>=2){var pu=x.responseURL||'${u}';showInfo('XHR Range:0-0: '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}};x.send();`);
  if (stratId === 170) return base(`var x=new XMLHttpRequest();x.open('GET','${u}',true);x.setRequestHeader('Accept','*/*');x.onerror=function(){var x2=new XMLHttpRequest();x2.open('GET','${cfEsc}',true);x2.onreadystatechange=function(){if(x2.readyState>=2){var pu=x2.responseURL||'${cfEsc}';showInfo('CF fallback: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}};x2.send();};x.onreadystatechange=function(){if(x.readyState>=2&&x.status>0){var pu=x.responseURL||'${u}';showInfo('XHR orig: '+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}};x.send();`);

  // ── WebView Config (176-200) ─────────────────────────────────────────────────
  // 176+177 handled specially in JSX (source.uri)
  if (stratId === 178) return base(`v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 179) return base(`v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 180) return base(`v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 181 || stratId === 182 || stratId === 183 || stratId === 184 || stratId === 185) return base(`v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 186 || stratId === 187 || stratId === 188) return base(`v.src='${cfEsc}';v.load();v.play().catch(function(){});`);
  if (stratId === 189) return base(`document.getElementById('v').style.display='none';var f=document.createElement('iframe');f.src='${u}';f.style.cssText='width:100%;height:100%;border:none;';document.body.appendChild(f);`);
  if (stratId === 190) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}object{width:100%;height:100%}</style></head><body><object data="${url}" type="video/mp4"><video src="${url}" playsinline autoplay controls style="width:100%;height:100%"></video></object><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();document.querySelector('video').addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});document.querySelector('video').addEventListener('error',function(e){send({type:'error',message:'object/video error'});});</script></body></html>`;
  if (stratId === 191) return base(`v.innerHTML='<source src="${u}" type="video/mp4"><source src="${url.replace(/\.mp4/, ".webm")}" type="video/webm"><source src="${url.replace(/\.mp4/, ".ogg")}" type="video/ogg">';v.load();v.play().catch(function(){});`);
  if (stratId === 192) return base(`v.crossOrigin='anonymous';v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 193) return base(`v.crossOrigin='use-credentials';v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 194) return base(`v.preload='none';v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 195) return base(`v.preload='metadata';v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 196) return base(`v.muted=false;v.src='${u}';v.load();v.play().catch(function(e){v.muted=true;v.play().catch(function(){});});`);
  if (stratId === 197) return base(`v.src='${u}';v.load();v.play().then(function(){try{v.requestFullscreen();}catch(e){}}).catch(function(){});`);
  if (stratId === 198) return base(`v.src='${cfEsc}';v.load();v.play().catch(function(){});`);
  if (stratId === 199) return base(`v.src='${cfEsc}';v.load();v.play().catch(function(){});`);
  if (stratId === 200) {
    const api = apiBase ?? "";
    return base(`fetch('${api}/api/flix2/stream-url?streamUrl='+encodeURIComponent('${u}')).then(function(r){return r.json();}).then(function(d){var pu=d.url||'${u}';showInfo('server via='+d.via+' url='+pu.slice(0,80));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){v.src='${cfEsc}';v.load();v.play().catch(function(){});});`);
  }

  // ── WebView Inject (201-215) ─────────────────────────────────────────────────
  if (stratId === 201) return base(`var origFetch=window.fetch;window.fetch=function(url,opts){opts=opts||{};opts.headers=Object.assign({},${fetchHdrs},opts.headers||{});return origFetch(url,opts);};v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 202) return base(`var origXHR=window.XMLHttpRequest;window.XMLHttpRequest=function(){var x=new origXHR();var origOpen=x.open.bind(x);x.open=function(m,u,a){origOpen(m,u,a);try{x.setRequestHeader('User-Agent','${UA.CHROME_WIN}');}catch(e){}try{x.setRequestHeader('Referer','https://nixplay.lat/');}catch(e){}};return x;};v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 203) return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="Referer" content="https://nixplay.lat/"/><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style></head><body><video id="v" src="${url}" playsinline webkit-playsinline preload="auto"></video><script>var rn=window.ReactNativeWebView;function send(m){try{rn.postMessage(JSON.stringify(m));}catch(e){}}var t0=Date.now();var v=document.getElementById('v');v.addEventListener('loadedmetadata',function(){send({type:'ready',ms:Date.now()-t0});});v.addEventListener('playing',function(){send({type:'playing',ms:Date.now()-t0});});v.addEventListener('error',function(){send({type:'error',message:'meta-ref: '+(v.error?v.error.message:'err')});});v.play().catch(function(){});</script></body></html>`;
  if (stratId === 204) { const embUrl = url.replace("https://", "https://Reis007-vods:Reis12%40%40@"); return base(`v.src='${esc(embUrl)}';v.load();v.play().catch(function(){});`); }
  if (stratId === 205) return base(`var h=new Headers(${fetchHdrs});fetch('${u}',{method:'HEAD',redirect:'manual',headers:h}).then(function(r){var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('Headers(): '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'Headers(): '+String(e)});});`);
  if (stratId === 206) return base(`var req=new Request('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}});fetch(req).then(function(r){var loc=r.headers.get('location');var pu=loc||'${u}';showInfo('Request(): '+pu.slice(0,100));v.src=pu;v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'Request(): '+String(e)});});`);
  if (stratId === 207) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location');if(loc){send({type:'info',message:'postMsg Location: '+loc.slice(0,100)});showInfo('postMsg: '+loc.slice(0,100));v.src=loc;v.load();v.play().catch(function(){});}else{v.src='${u}';v.load();v.play().catch(function(){});}}).catch(function(e){send({type:'error',message:'postMsg: '+String(e)});});`);
  if (stratId === 208) return base(`document.cookie='referer=https://nixplay.lat/;path=/';document.cookie='origin=https://nixplay.lat;path=/';v.src='${u}';v.load();v.play().catch(function(){});`);
  if (stratId === 209) return base(`fetch('${u}',{method:'HEAD',redirect:'follow',headers:${fetchHdrs}}).then(function(r){var info=[];r.headers.forEach(function(v,k){info.push(k+'='+v);});var txt='FinalURL: '+r.url+'\\n'+info.join('\\n');showInfo(txt);send({type:'info',message:txt.slice(0,300)});v.src=r.url||'${u}';v.load();v.play().catch(function(){});}).catch(function(e){send({type:'error',message:'all-hdrs: '+String(e)});});`);
  if (stratId === 210) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location')||'';var isCineveo=loc.includes('cineveo.lat');var isFonte=loc.includes('fontedecanais')||loc.includes('72yrci');var isDirect=!loc||(!isCineveo&&!isFonte);var cf='${cfEsc}';if(isCineveo||isFonte){showInfo('Auto: http://fontedecanais → CF(ORIG): '+cf.slice(0,60));v.src=cf;v.load();v.play().catch(function(){});}else if(isDirect){showInfo('Auto: direct → '+loc.slice(0,60));v.src=loc||'${u}';v.load();v.play().catch(function(){});}}).catch(function(e){v.src='${cfEsc}';v.load();v.play().catch(function(){});});`);
  if (stratId === 211) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location')||'';var tkMatch=loc.match(/token=([^&\\s]+)/);var tk=tkMatch?tkMatch[1]:'nenhum';try{var dec=atob(decodeURIComponent(tk.replace(/-/g,'+').replace(/_/g,'/')));showInfo('Token raw: '+tk.slice(0,60)+'\\nDecoded: '+dec.slice(0,60)+'\\nCDN: '+(loc?new URL(loc).hostname:'none'));}catch(e){showInfo('Token: '+tk.slice(0,80)+'\\nCDN: '+(loc?new URL(loc).hostname:'none'));}if(loc){v.src=loc;v.load();v.play().catch(function(){});}}).catch(function(e){send({type:'error',message:'decode-token: '+String(e)});});`);
  if (stratId === 212) return base(`fetch('${u}',{method:'HEAD',redirect:'manual',headers:${fetchHdrs}}).then(function(r){var loc=r.headers.get('location');if(loc){showInfo('→ location.href: '+loc.slice(0,80));window.location.href=loc;}else{v.src='${u}';v.load();v.play().catch(function(){});}}).catch(function(e){send({type:'error',message:'locHref: '+String(e)});});`);
  if (stratId === 213) return base(`if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw-test.js').then(function(r){showInfo('SW registered: '+r.scope);v.src='${u}';v.load();v.play().catch(function(){});}).catch(function(e){showInfo('SW not avail: '+String(e));v.src='${cfEsc}';v.load();v.play().catch(function(){});});}else{showInfo('SW: not supported');v.src='${cfEsc}';v.load();v.play().catch(function(){});}`);
  if (stratId === 214) return base(`var t0b=Date.now();fetch('${cfEsc}',{method:'HEAD',headers:{'Range':'bytes=0-102400','Accept':'*/*'}}).then(function(r){var status=r.status;var cr=r.headers.get('content-range');var cl=r.headers.get('content-length');var ms=Date.now()-t0b;showInfo('Range test CF:\\nStatus: '+status+' (206=OK)\\nContent-Range: '+cr+'\\nContent-Length: '+cl+'\\nTTFB: '+ms+'ms');send({type:'info',message:'CF Range '+status+' TTFB:'+ms+'ms CR:'+cr});}).catch(function(e){send({type:'error',message:'CF Range test: '+String(e)});});`);
  if (stratId === 215) return base(`Promise.all([fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.CHROME_WIN}','Referer':'https://nixplay.lat/','Accept':'*/*'}}).then(function(r){return {ua:'Chrome',loc:r.headers.get('location')||'',status:r.status};}).catch(function(e){return {ua:'Chrome',loc:'',err:String(e)};}),fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.FIREFOX_WIN}','Accept':'*/*'}}).then(function(r){return {ua:'Firefox',loc:r.headers.get('location')||'',status:r.status};}).catch(function(e){return {ua:'Firefox',loc:'',err:String(e)};}),fetch('${u}',{method:'HEAD',redirect:'manual',headers:{'User-Agent':'${UA.VLC}','Accept':'*/*'}}).then(function(r){return {ua:'VLC',loc:r.headers.get('location')||'',status:r.status};}).catch(function(e){return {ua:'VLC',loc:'',err:String(e)};})]).then(function(rs){var info=rs.map(function(r){return r.ua+': '+(r.loc?r.loc.slice(0,50):'empty/err '+(r.err||''));}).join('\\n');showInfo(info);var w=rs.find(function(r){return r.loc&&r.loc.length>5;});if(w){var pu=w.loc;if(pu.startsWith('http://')){pu='${cfEsc}';}v.src=pu;v.load();v.play().catch(function(){});}});`);

  return base(`v.src='${u}';v.load();v.play().catch(function(){});`);
}

// ── Helper: resolve redirect with AbortController (Hermes-safe, no AbortSignal.timeout) ──
async function resolveRedirect(
  url: string,
  opts?: { ua?: string; referer?: boolean; method?: "HEAD" | "GET"; range?: string; timeout?: number; retries?: number }
): Promise<string> {
  const { ua = UA.CHROME_WIN, referer = true, method = "HEAD", range, timeout = 8000, retries = 1 } = opts ?? {};
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const headers: Record<string, string> = { "User-Agent": ua, "Accept": "*/*" };
    if (referer) { headers["Referer"] = "https://nixplay.lat/"; headers["Origin"] = "https://nixplay.lat"; }
    if (range) headers["Range"] = range;
    try {
      const resp = await fetch(url, { method, headers, redirect: "manual", signal: ctrl.signal });
      clearTimeout(t);
      const loc = resp.headers.get("location") ?? resp.headers.get("Location");
      if (loc && loc !== url) return loc;
    } catch { clearTimeout(t); }
  }
  // fallback: GET redirect:follow
  const ctrl2 = new AbortController();
  const t2 = setTimeout(() => ctrl2.abort(), timeout);
  try {
    const r2 = await fetch(url, { method: "GET", headers: { "User-Agent": ua, "Accept": "*/*", ...(range ? { Range: range } : {}) }, redirect: "follow", signal: ctrl2.signal });
    clearTimeout(t2);
    if (r2.url && r2.url !== url) return r2.url;
  } catch { clearTimeout(t2); }
  return url;
}

// ── Compute ExoPlayer URL for a given strategy ─────────────────────────────────
async function computeExoUrl(
  stratId: number,
  url: string,
  apiBase: string
): Promise<{ playUrl: string; headers?: Record<string, string>; ext?: string; info?: string }> {
  const cf = `${CF_WORKER}/?url=${encodeURIComponent(url)}`;
  const aa = url.replace(/@@/g, "%40%40");

  // IDs 1-10 — básico
  if (stratId === 1)  return { playUrl: url };
  if (stratId === 2)  return { playUrl: url, headers: { "User-Agent": UA.CHROME_WIN } };
  if (stratId === 3)  return { playUrl: url, headers: { "User-Agent": UA.CHROME_AND } };
  if (stratId === 4)  return { playUrl: url, headers: { "User-Agent": UA.SAFARI_IOS } };
  if (stratId === 5)  return { playUrl: url, headers: FLIX2_HEADERS };
  if (stratId === 6)  return { playUrl: cf };
  if (stratId === 7)  { const loc = await resolveRedirect(url); return { playUrl: loc }; }
  if (stratId === 8)  { const loc = await resolveRedirect(url); return { playUrl: loc.startsWith("http://") ? cf : loc }; }
  if (stratId === 9)  return { playUrl: aa };
  if (stratId === 10) return { playUrl: url, headers: FLIX2_HEADERS, ext: "m3u8" };

  // IDs 21-35 — UA variants
  const uaMap: Record<number, string> = {
    21: UA.FIREFOX_WIN, 22: UA.FIREFOX_AND, 23: UA.EDGE_WIN, 24: UA.CHROME_LIN,
    25: UA.CHROME_MAC,  26: UA.SAMSUNG,     27: UA.WEBOS_TV,  28: UA.TIZEN_TV,
    29: UA.ANDROID_TV,  30: UA.VLC,          31: UA.MPV,       32: UA.CURL,
    33: UA.EMPTY,       34: UA.EXOPLAYER,
  };
  if (uaMap[stratId]) return { playUrl: url, headers: { "User-Agent": uaMap[stratId], "Referer": "https://nixplay.lat/", "Origin": "https://nixplay.lat", "Accept": "*/*" } };
  if (stratId === 35) return { playUrl: url, headers: { ...FLIX2_HEADERS, "User-Agent": UA.CHROME_WIN } };

  // IDs 36-55 — header variants
  if (stratId === 36) return { playUrl: url, headers: { "Referer": "https://nixplay.lat/" } };
  if (stratId === 37) return { playUrl: url, headers: { "Origin": "https://nixplay.lat" } };
  if (stratId === 38) return { playUrl: url, headers: { "Referer": "https://nixplay.lat/", "Origin": "https://nixplay.lat" } };
  if (stratId === 39) return { playUrl: url, headers: { "User-Agent": UA.CHROME_WIN, "Referer": "http://fontedecanais.me" } };
  if (stratId === 40) return { playUrl: url, headers: { "User-Agent": UA.CHROME_WIN, "Referer": "http://www-fontedecanais-me.72yrci50ppqp71.com" } };
  if (stratId === 41) return { playUrl: url, headers: { "User-Agent": UA.CHROME_WIN, "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8" } };
  if (stratId === 42) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Accept-Encoding": "identity" } };
  if (stratId === 43) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Cache-Control": "no-cache" } };
  if (stratId === 44) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Pragma": "no-cache" } };
  if (stratId === 45) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Connection": "keep-alive" } };
  if (stratId === 46) return { playUrl: url, headers: { ...FLIX2_HEADERS, "X-Forwarded-For": "1.1.1.1" } };
  if (stratId === 47) return { playUrl: url, headers: { ...FLIX2_HEADERS, "X-Real-IP": "1.1.1.1" } };
  if (stratId === 48) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Sec-Fetch-Dest": "video" } };
  if (stratId === 49) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Sec-Fetch-Dest": "video", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Site": "cross-site" } };
  if (stratId === 50) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Range": "bytes=0-" } };
  if (stratId === 51) return { playUrl: url, headers: { "User-Agent": UA.CHROME_WIN, "Referer": "https://nixplay.lat/", "Origin": "https://nixplay.lat", "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5", "Accept-Language": "pt-BR,pt;q=0.9", "Accept-Encoding": "identity", "Connection": "keep-alive", "Sec-Fetch-Dest": "video", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Site": "cross-site" } };
  if (stratId === 52) return { playUrl: url, headers: { ...FLIX2_HEADERS, "TE": "trailers" } };
  if (stratId === 53) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Accept-Language": "pt-BR,pt;q=0.9" } };
  if (stratId === 54) return { playUrl: url, headers: { "Accept": "*/*" } };
  if (stratId === 55) return { playUrl: url, headers: { ...FLIX2_HEADERS, "Via": "1.1 cloudflare" } };

  // IDs 56-70 — URL mutations
  if (stratId === 56) return { playUrl: aa, headers: FLIX2_HEADERS };
  if (stratId === 57) return { playUrl: url.replace(/@@/g, "%2540%2540"), headers: FLIX2_HEADERS };
  if (stratId === 58) return { playUrl: url.toLowerCase(), headers: FLIX2_HEADERS };
  if (stratId === 59) return { playUrl: `${url}?t=${Date.now()}`, headers: FLIX2_HEADERS };
  if (stratId === 60) return { playUrl: url.replace(/\.mp4$/, ""), headers: FLIX2_HEADERS };
  if (stratId === 61) return { playUrl: url.replace(/\.mp4$/, ".ts"), headers: FLIX2_HEADERS };
  if (stratId === 62) return { playUrl: url.replace(/\.mp4$/, ".mkv"), headers: FLIX2_HEADERS };
  if (stratId === 63) return { playUrl: url.replace("nixplay.lat", "nixplay.lat:80"), headers: FLIX2_HEADERS };
  if (stratId === 64) return { playUrl: url.replace("https://", "http://"), headers: FLIX2_HEADERS };
  if (stratId === 65) return { playUrl: url.replace(/@@/, "@"), headers: FLIX2_HEADERS };
  if (stratId === 66) return { playUrl: aa, headers: FLIX2_HEADERS };
  if (stratId === 67) return { playUrl: `${url}&start=0`, headers: FLIX2_HEADERS };
  if (stratId === 68) return { playUrl: `${url}/`, headers: FLIX2_HEADERS };
  if (stratId === 69) return { playUrl: `${CF_WORKER}/?url=${encodeURIComponent(aa)}` };
  if (stratId === 70) return { playUrl: `${CF_WORKER}/?url=${encodeURIComponent(url.replace("https://", "http://"))}` };

  // IDs 71-95 — resolve strategies
  if (stratId === 71) { const loc = await resolveRedirect(url); return { playUrl: loc }; }
  if (stratId === 72) { const loc = await resolveRedirect(url); return { playUrl: loc, headers: FLIX2_HEADERS }; }
  if (stratId === 73) { const loc = await resolveRedirect(url, { method: "GET" }); return { playUrl: loc }; }
  if (stratId === 74) { const loc = await resolveRedirect(url, { method: "GET", range: "bytes=0-0" }); return { playUrl: loc }; }
  if (stratId === 75) { const loc = await resolveRedirect(url, { method: "GET", range: "bytes=0-1" }); return { playUrl: loc }; }
  if (stratId === 76) { const loc = await resolveRedirect(url, { method: "GET", range: "bytes=0-99" }); return { playUrl: loc }; }
  if (stratId === 77) { const loc = await resolveRedirect(url, { ua: UA.FIREFOX_WIN }); return { playUrl: loc }; }
  if (stratId === 78) { const loc = await resolveRedirect(url, { ua: UA.EDGE_WIN }); return { playUrl: loc }; }
  if (stratId === 79) { const loc = await resolveRedirect(url, { ua: UA.SAMSUNG }); return { playUrl: loc }; }
  if (stratId === 80) { const loc = await resolveRedirect(url, { referer: false }); return { playUrl: loc }; }
  if (stratId === 81) { const loc = await resolveRedirect(url, { ua: "", referer: true }); return { playUrl: loc }; }
  if (stratId === 82) { const loc = await resolveRedirect(url, { retries: 3 }); return { playUrl: loc }; }
  if (stratId === 83) { const loc = await resolveRedirect(url); return { playUrl: loc.startsWith("http://") ? cf : loc, info: `★ CF(ORIG) via fontedecanais` }; }
  if (stratId === 84) { const loc = await resolveRedirect(url); const isHttp = loc.startsWith("http://"); return { playUrl: isHttp ? `${CF_WORKER}/?url=${encodeURIComponent(loc)}` : loc }; }
  if (stratId === 85) return { playUrl: cf, info: "Sempre CF(ORIG) — ignora Location" };
  if (stratId === 86) { const loc = await resolveRedirect(url); return { playUrl: `${CF_WORKER}/?url=${encodeURIComponent(loc)}` }; }
  if (stratId === 87) { const loc = await resolveRedirect(url, { method: "GET" }); return { playUrl: `${CF_WORKER}/?url=${encodeURIComponent(loc)}` }; }
  if (stratId === 88) { const loc = await resolveRedirect(url, { method: "GET" }); return { playUrl: loc }; }
  if (stratId === 89) { const loc = await resolveRedirect(url, { method: "GET" }); return { playUrl: loc, headers: FLIX2_HEADERS }; }
  if (stratId === 90) { const loc = await resolveRedirect(url, { timeout: 3000 }); return { playUrl: loc.startsWith("http://") ? cf : loc }; }
  if (stratId === 91) { const loc = await resolveRedirect(url, { timeout: 20000 }); return { playUrl: loc.startsWith("http://") ? cf : loc }; }
  if (stratId === 92) { const loc1 = await resolveRedirect(url); const loc2 = await resolveRedirect(loc1); return { playUrl: loc2.startsWith("http://") ? cf : loc2 }; }
  if (stratId === 93) { const loc = await resolveRedirect(url, { ua: "", referer: false }); return { playUrl: loc.startsWith("http://") || loc === url ? cf : loc }; }
  if (stratId === 94) { const loc = await resolveRedirect(url, { ua: UA.VLC }); return { playUrl: loc.startsWith("http://") ? cf : loc }; }
  if (stratId === 95) { return { playUrl: cf, headers: { "User-Agent": UA.ANDROID_TV } }; }

  // IDs 96-110 — server-side
  if (stratId === 96 || stratId === 97 || stratId === 98 || stratId === 99 || stratId === 101) {
    const nocache = stratId === 99 ? "&nocache=1" : "";
    try {
      const r = await fetch(`${apiBase}/api/flix2/stream-url?streamUrl=${encodeURIComponent(url)}${nocache}`);
      const d = await r.json() as { url?: string; via?: string };
      const resolved = d?.url ?? url;
      const via = d?.via ?? "?";
      if (stratId === 98 || (stratId === 101 && (via === "fontedecanais" || resolved.includes("72yrci") || resolved.includes("fontedecanais")))) {
        return { playUrl: cf, info: `★ via=${via} → CF(ORIG)` };
      }
      return { playUrl: resolved, headers: stratId === 97 ? FLIX2_HEADERS : undefined, info: `via=${via}` };
    } catch (e: any) { return { playUrl: cf, info: `API error: ${e.message}` }; }
  }
  if (stratId === 102) { const loc = await resolveRedirect(`${CF_WORKER}/?url=${encodeURIComponent(url)}`); return { playUrl: loc !== `${CF_WORKER}/?url=${encodeURIComponent(url)}` ? loc : cf }; }
  if (stratId === 103) return { playUrl: `${CF_WORKER}/?url=${encodeURIComponent(aa)}` };
  if (stratId === 104) return { playUrl: cf, ext: "mp4" };
  if (stratId === 107) {
    try {
      const r = await fetch(`${apiBase}/api/flix2/stream-url?streamUrl=${encodeURIComponent(url)}`);
      const d = await r.json() as { url?: string; via?: string };
      return { playUrl: cf, info: `server via=${d?.via}, routed to CF(ORIG)` };
    } catch { return { playUrl: cf }; }
  }
  if (stratId === 108) return { playUrl: cf, headers: { "User-Agent": UA.FIREFOX_WIN } };
  if (stratId === 109) return { playUrl: cf, headers: { "User-Agent": UA.SAMSUNG } };
  if (stratId === 110) return { playUrl: cf, headers: FLIX2_HEADERS };

  return { playUrl: url };
}

// ── Run info strategy (no video — just fetch data) ────────────────────────────
async function runInfoStrategy(stratId: number, url: string, apiBase: string): Promise<string> {
  if (stratId === 100 || stratId === 217) {
    try {
      const r = await fetch(`${apiBase}/api/flix2/debug-url?streamUrl=${encodeURIComponent(url)}`);
      const d = await r.json() as any;
      return JSON.stringify(d, null, 2).slice(0, 500);
    } catch (e: any) { return `Erro: ${e.message}`; }
  }
  if (stratId === 105) {
    try {
      const r = await fetch(`${apiBase}/api/admin/server-ip`).catch(() => fetch(`${apiBase}/api/ip`));
      const d = await r.json() as any;
      return `IP servidor: ${d?.ip ?? d?.publicIp ?? JSON.stringify(d)}`;
    } catch (e: any) { return `Erro IP: ${e.message}`; }
  }
  if (stratId === 106) {
    try {
      const r = await fetch(`${apiBase}/api/flix2/warm-status`);
      const d = await r.json() as any;
      return JSON.stringify(d, null, 2).slice(0, 400);
    } catch (e: any) { return `Erro warm: ${e.message}`; }
  }
  if (stratId === 216) {
    try {
      const r = await fetch(`${apiBase}/api/flix2/stream-url?streamUrl=${encodeURIComponent(url)}`);
      const d = await r.json() as any;
      return `via: ${d?.via}\nurl: ${d?.url ?? "—"}\ncached: ${d?.cached}`;
    } catch (e: any) { return `Erro: ${e.message}`; }
  }
  if (stratId === 218) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      await fetch(`${CF_WORKER}/?url=${encodeURIComponent(url)}`, { method: "HEAD", signal: ctrl.signal });
      clearTimeout(t);
      return `CF Worker TTFB: ${Date.now() - t0}ms`;
    } catch (e: any) { return `CF Worker falhou: ${e.message} (${Date.now() - t0}ms)`; }
  }
  if (stratId === 219) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`${CF_WORKER}/?url=${encodeURIComponent(url)}`, { method: "HEAD", headers: { "Range": "bytes=0-102400" }, signal: ctrl.signal });
      clearTimeout(t);
      return `Status: ${r.status}\nAccept-Ranges: ${r.headers.get("accept-ranges")}\nContent-Range: ${r.headers.get("content-range")}\nContent-Length: ${r.headers.get("content-length")}`;
    } catch (e: any) { return `Range test falhou: ${e.message}`; }
  }
  if (stratId === 220) {
    const results: string[] = [];
    await Promise.all([
      (async () => { const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 5000); try { const r = await fetch(`${CF_WORKER}/?url=${encodeURIComponent(url)}`, { method: "HEAD", signal: ctrl.signal }); results.push(`#6 CF Worker: ${r.status} ✓`); } catch { results.push("#6 CF Worker: falhou"); } })(),
      (async () => { try { const loc = await resolveRedirect(url); const isHttp = loc.startsWith("http://"); results.push(`#83 HEAD→CF: loc=${isHttp ? "http:// ✓" : loc.slice(0, 40)}`); } catch { results.push("#83 HEAD resolve: falhou"); } })(),
      (async () => { try { const r = await fetch(`${apiBase}/api/flix2/stream-url?streamUrl=${encodeURIComponent(url)}`); const d = await r.json() as any; results.push(`#96 API: via=${d?.via} url=${(d?.url ?? "").slice(0, 40)}`); } catch (e: any) { results.push(`#96 API: ${e.message}`); } })(),
    ]);
    return results.join("\n");
  }
  return "Sem implementação para esta estratégia.";
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LinkTesterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [testUrl, setTestUrl] = useState(DEFAULT_URL);
  const [results, setResults] = useState<Record<number, TestResult>>({});
  const [activeModal, setActiveModal] = useState<Strategy | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [modalPlayerReady, setModalPlayerReady] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupId>>(new Set());

  const videoRef = useRef<any>(null);
  const t0 = useRef<number>(0);

  React.useEffect(() => {
    getApiBase().then((b: string) => setApiBase(b)).catch(() => {});
  }, []);

  const setResult = useCallback((id: number, result: TestResult) => {
    setResults((prev) => ({ ...prev, [id]: result }));
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setResolvedUrl(null);
    setInfoText(null);
    setModalPlayerReady(false);
    try { videoRef.current?.pauseAsync?.(); } catch {}
  }, []);

  const toggleGroup = useCallback((group: GroupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }, []);

  const openStrategy = useCallback(async (strategy: Strategy) => {
    const url = testUrl.trim();
    if (!url) return;
    t0.current = Date.now();
    setResult(strategy.id, { status: "loading", message: "Testando..." });

    if (strategy.type === "info") {
      setActiveModal(strategy);
      setInfoText(null);
      setResolvedUrl(null);
      setModalPlayerReady(false);
      try {
        const info = await runInfoStrategy(strategy.id, url, apiBase);
        setInfoText(info);
        setResult(strategy.id, { status: "ok", message: info.slice(0, 100), ms: Date.now() - t0.current });
      } catch (e: any) {
        const msg = e.message ?? "Erro";
        setInfoText(msg);
        setResult(strategy.id, { status: "error", message: msg });
      }
      return;
    }

    setActiveModal(strategy);
    setResolvedUrl(null);
    setInfoText(null);
    setModalPlayerReady(false);

    if (strategy.type === "exo") {
      try {
        const { playUrl, info } = await computeExoUrl(strategy.id, url, apiBase);
        if (info) setResult(strategy.id, { status: "loading", message: info });
        setResolvedUrl(playUrl);
      } catch (e: any) {
        setResult(strategy.id, { status: "error", message: e.message ?? "Erro" });
      }
    }
    // webview: HTML is built in render via buildWebViewHtml
  }, [testUrl, apiBase, setResult]);

  const getHeaders = (stratId: number): Record<string, string> | undefined => {
    return undefined; // computed inside computeExoUrl, passed via resolvedSource
  };

  const [resolvedSource, setResolvedSource] = useState<{ uri: string; headers?: Record<string, string>; ext?: string } | null>(null);

  // Re-compute ExoPlayer source when resolvedUrl changes
  React.useEffect(() => {
    if (!activeModal || activeModal.type !== "exo" || !resolvedUrl) { setResolvedSource(null); return; }
    // Re-run to get headers/ext
    computeExoUrl(activeModal.id, testUrl.trim(), apiBase).then(({ playUrl, headers, ext }) => {
      setResolvedSource({ uri: playUrl, headers, ext });
    }).catch(() => setResolvedSource({ uri: resolvedUrl }));
  }, [resolvedUrl, activeModal?.id]);

  const isExoGroup = (g: GroupId | undefined) => g && (
    g === "ExoPlayer" || g === "ExoPlayer-UA" || g === "ExoPlayer-Hdrs" ||
    g === "ExoPlayer-URL" || g === "ExoPlayer-Resolve" || g === "ExoPlayer-Server"
  );

  // Special WebView props for config strategies
  const getWebViewProps = (stratId: number) => {
    const base = {
      mediaPlaybackRequiresUserAction: false,
      allowsInlineMediaPlayback: true,
      javaScriptEnabled: true,
      domStorageEnabled: true,
      originWhitelist: ["*"],
      mixedContentMode: "always" as const,
      allowsProtectedMedia: stratId !== 188,
      sharedCookiesEnabled: stratId === 186,
      thirdPartyCookiesEnabled: stratId === 187,
    };
    const uaMap: Record<number, string> = {
      181: UA.SAMSUNG, 182: UA.FIREFOX_AND, 183: UA.CHROME_AND,
      184: UA.TIZEN_TV, 199: UA.SAMSUNG,
    };
    const baseUrlMap: Record<number, string> = {
      11: "https://nixplay.lat", 12: "https://nixplay.lat", 13: "https://nixplay.lat",
      14: "https://nixplay.lat", 15: "https://nixplay.lat", 20: "https://nixplay.lat",
      178: "http://www-fontedecanais-me.72yrci50ppqp71.com",
      179: "https://cineveo.lat", 180: "https://fontedecanais.me",
      198: "http://www-fontedecanais-me.72yrci50ppqp71.com",
    };
    return {
      ...base,
      userAgent: stratId === 185 ? undefined : (uaMap[stratId] ?? UA.CHROME_WIN),
      baseUrl: baseUrlMap[stratId],
    };
  };

  const cfUrl = `${CF_WORKER}/?url=${encodeURIComponent(testUrl.trim())}`;

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>🧪 Testador de Links</Text>
          <Text style={st.subtitle}>220 estratégias — nixplay.lat e fontedecanais</Text>
        </View>
        <View style={{ backgroundColor: "#e5091420", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: RED, fontSize: 11, fontWeight: "800" }}>{STRATEGIES.length}</Text>
        </View>
      </View>

      {/* URL Input */}
      <View style={st.urlRow}>
        <TextInput
          style={st.urlInput}
          value={testUrl}
          onChangeText={setTestUrl}
          placeholder="URL para testar..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Pressable style={st.clearBtn} onPress={() => setTestUrl(DEFAULT_URL)}>
          <Feather name="rotate-ccw" size={14} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: "row", paddingHorizontal: 12, marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
        <Text style={{ color: "#22c55e", fontSize: 10 }}>★ = estratégia recomendada</Text>
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Toque para testar | resultado aparece na card</Text>
      </View>

      <ScrollView contentContainerStyle={st.list} showsVerticalScrollIndicator={false}>
        {GROUP_ORDER.map((group) => {
          const strategies = STRATEGIES.filter((s) => s.group === group);
          const collapsed = collapsedGroups.has(group);
          const groupColor = GROUP_COLOR[group];
          const okCount = strategies.filter((s) => results[s.id]?.status === "ok").length;
          return (
            <View key={group}>
              <Pressable style={st.groupHeader} onPress={() => toggleGroup(group)}>
                <View style={[st.groupDot, { backgroundColor: groupColor }]} />
                <Text style={[st.groupLabel, { color: groupColor }]}>{GROUP_LABEL[group]}</Text>
                {okCount > 0 && (
                  <View style={{ backgroundColor: "#22c55e20", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 }}>
                    <Text style={{ color: "#22c55e", fontSize: 10, fontWeight: "800" }}>✓{okCount}</Text>
                  </View>
                )}
                <Feather name={collapsed ? "chevron-down" : "chevron-up"} size={14} color="rgba(255,255,255,0.4)" style={{ marginLeft: "auto" as any }} />
              </Pressable>
              {!collapsed && strategies.map((s) => {
                const res = results[s.id];
                const isStar = s.name.startsWith("★");
                return (
                  <Pressable key={s.id} style={[st.strategyCard, isStar && { borderColor: "#f59e0b40", backgroundColor: "#f59e0b08" }]} onPress={() => openStrategy(s)}>
                    <View style={st.strategyLeft}>
                      <View style={[st.strategyNum, { backgroundColor: `${GROUP_COLOR[s.group]}25` }]}>
                        <Text style={[st.strategyNumText, { color: GROUP_COLOR[s.group] }]}>{s.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.strategyName, isStar && { color: "#f59e0b" }]}>{s.name}</Text>
                        <Text style={st.strategyDesc}>{s.desc}</Text>
                        {res && (
                          <Text style={[st.strategyResult, {
                            color: res.status === "ok" ? "#22c55e" : res.status === "error" ? RED : "#f59e0b",
                          }]} numberOfLines={3}>
                            {res.status === "ok" ? `✓ ${res.message}${res.ms ? ` (${res.ms}ms)` : ""}` :
                             res.status === "error" ? `✗ ${res.message}` : `⏳ ${res.message}`}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={[st.playBtn, {
                      backgroundColor: res?.status === "ok" ? "rgba(34,197,94,0.2)" : res?.status === "error" ? "rgba(229,9,20,0.2)" : `${GROUP_COLOR[s.group]}20`
                    }]}>
                      {res?.status === "loading" ? (
                        <ActivityIndicator size="small" color="#f59e0b" />
                      ) : (
                        <Feather
                          name={s.type === "info" ? "info" : "play"}
                          size={15}
                          color={res?.status === "ok" ? "#22c55e" : res?.status === "error" ? RED : GROUP_COLOR[s.group]}
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal */}
      <Modal visible={!!activeModal} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            {/* Modal header */}
            <View style={[st.modalHeader, { borderBottomColor: `${GROUP_COLOR[activeModal?.group ?? "ExoPlayer"]}40` }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.modalTitle, { color: activeModal?.name.startsWith("★") ? "#f59e0b" : "#fff" }]}>
                  #{activeModal?.id} — {activeModal?.name}
                </Text>
                <Text style={[st.modalGroup, { color: GROUP_COLOR[activeModal?.group ?? "ExoPlayer"] }]}>
                  {activeModal?.group} · {activeModal?.type.toUpperCase()}
                </Text>
              </View>
              <Pressable onPress={closeModal} style={st.modalClose}>
                <Feather name="x" size={20} color="#fff" />
              </Pressable>
            </View>

            {/* Resolved URL */}
            {resolvedSource?.uri && (
              <Text style={st.resolvedUrl} numberOfLines={2}>
                ▶ {resolvedSource.uri}
              </Text>
            )}

            {/* Player area */}
            <View style={st.playerArea}>
              {activeModal?.type === "info" ? (
                infoText === null ? (
                  <View style={st.playerLoading}>
                    <ActivityIndicator size="large" color={RED} />
                    <Text style={st.playerLoadingText}>Buscando dados...</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1, padding: 14 }}>
                    <Text style={{ color: "#4ade80", fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", fontSize: 11, lineHeight: 17 }}>
                      {infoText}
                    </Text>
                  </ScrollView>
                )
              ) : isExoGroup(activeModal?.group) ? (
                resolvedSource?.uri && Video ? (
                  <Video
                    ref={videoRef}
                    source={{
                      uri: resolvedSource.uri,
                      headers: resolvedSource.headers,
                      ...(resolvedSource.ext ? { overrideFileExtensionAndroid: resolvedSource.ext } : { overrideFileExtensionAndroid: "mp4" }),
                    } as any}
                    style={st.videoPlayer}
                    resizeMode={ResizeMode?.CONTAIN ?? "contain"}
                    shouldPlay
                    isLooping={false}
                    onLoad={(status: any) => {
                      const ms = Date.now() - t0.current;
                      setModalPlayerReady(true);
                      setResult(activeModal!.id, { status: "ok", message: `✓ Funcionou! ${Math.round((status?.durationMillis ?? 0) / 1000)}s`, ms });
                    }}
                    onError={(err: any) => {
                      const msg = typeof err === "string" ? err : (err?.message ?? JSON.stringify(err));
                      setResult(activeModal!.id, { status: "error", message: msg.slice(0, 120) });
                    }}
                  />
                ) : (
                  <View style={st.playerLoading}>
                    <ActivityIndicator size="large" color={GROUP_COLOR[activeModal?.group ?? "ExoPlayer"]} />
                    <Text style={st.playerLoadingText}>Resolvendo URL...</Text>
                  </View>
                )
              ) : activeModal?.type === "webview" && WebView ? (
                // source.uri strategies (176, 177)
                activeModal.id === 176 ? (
                  <WebView
                    source={{ uri: testUrl.trim() }}
                    style={st.videoPlayer}
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback
                    javaScriptEnabled
                    mixedContentMode="always"
                    userAgent={UA.CHROME_WIN}
                    onError={() => setResult(activeModal!.id, { status: "error", message: "WebView URI error" })}
                    onLoad={() => { setModalPlayerReady(true); setResult(activeModal!.id, { status: "ok", message: "WebView URI carregou", ms: Date.now() - t0.current }); }}
                  />
                ) : activeModal.id === 177 ? (
                  <WebView
                    source={{ uri: cfUrl }}
                    style={st.videoPlayer}
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback
                    javaScriptEnabled
                    mixedContentMode="always"
                    userAgent={UA.CHROME_WIN}
                    onError={() => setResult(activeModal!.id, { status: "error", message: "WebView CF URI error" })}
                    onLoad={() => { setModalPlayerReady(true); setResult(activeModal!.id, { status: "ok", message: "WebView CF URI carregou", ms: Date.now() - t0.current }); }}
                  />
                ) : (
                  <WebView
                    source={(() => {
                      const html = buildWebViewHtml(testUrl.trim(), activeModal.id, apiBase);
                      const props = getWebViewProps(activeModal.id);
                      return { html, baseUrl: props.baseUrl };
                    })()}
                    style={st.videoPlayer}
                    {...(() => {
                      const props = getWebViewProps(activeModal.id);
                      return {
                        mediaPlaybackRequiresUserAction: props.mediaPlaybackRequiresUserAction,
                        allowsInlineMediaPlayback: props.allowsInlineMediaPlayback,
                        javaScriptEnabled: props.javaScriptEnabled,
                        domStorageEnabled: props.domStorageEnabled,
                        originWhitelist: props.originWhitelist,
                        mixedContentMode: props.mixedContentMode,
                        allowsProtectedMedia: props.allowsProtectedMedia,
                        sharedCookiesEnabled: props.sharedCookiesEnabled,
                        thirdPartyCookiesEnabled: props.thirdPartyCookiesEnabled,
                        userAgent: props.userAgent,
                      };
                    })()}
                    onMessage={(e: any) => {
                      try {
                        const msg = JSON.parse(e.nativeEvent.data);
                        if (msg.type === "ready" || msg.type === "playing") {
                          const ms = msg.ms ?? (Date.now() - t0.current);
                          setModalPlayerReady(true);
                          setResult(activeModal!.id, { status: "ok", message: `✓ Funcionou! ${ms}ms`, ms });
                        } else if (msg.type === "error") {
                          setResult(activeModal!.id, { status: "error", message: msg.message?.slice(0, 120) ?? "erro" });
                        } else if (msg.type === "info") {
                          setResult(activeModal!.id, { status: "loading", message: msg.message?.slice(0, 120) ?? "info" });
                        }
                      } catch {}
                    }}
                  />
                )
              ) : (
                <View style={st.playerLoading}>
                  <ActivityIndicator size="large" color={RED} />
                  <Text style={st.playerLoadingText}>Iniciando...</Text>
                </View>
              )}
            </View>

            {/* Status bar */}
            {activeModal && results[activeModal.id] && (
              <View style={[st.statusBar, {
                backgroundColor: results[activeModal.id].status === "ok" ? "rgba(34,197,94,0.12)"
                  : results[activeModal.id].status === "error" ? "rgba(229,9,20,0.12)" : "rgba(245,158,11,0.12)",
              }]}>
                <Text style={[st.statusText, {
                  color: results[activeModal.id].status === "ok" ? "#22c55e"
                    : results[activeModal.id].status === "error" ? RED : "#f59e0b",
                }]} numberOfLines={4}>
                  {results[activeModal.id].status === "ok" ? "✅ " : results[activeModal.id].status === "error" ? "❌ " : "⏳ "}
                  {results[activeModal.id].message}
                </Text>
              </View>
            )}

            <Pressable style={st.closeBtn} onPress={closeModal}>
              <Text style={st.closeBtnText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center", marginRight: 12 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 1 },
  urlRow: { flexDirection: "row", alignItems: "flex-start", margin: 12, backgroundColor: "#1a1a1a", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 10 },
  urlInput: { flex: 1, color: "#fff", fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", lineHeight: 16 },
  clearBtn: { padding: 4, marginLeft: 4 },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  groupHeader: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 6, paddingVertical: 4 },
  groupDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  groupLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, flex: 1 },
  strategyCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#141414", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 5 },
  strategyLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  strategyNum: { width: 26, height: 26, borderRadius: 13, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  strategyNumText: { fontSize: 10, fontWeight: "800" },
  strategyName: { color: "#fff", fontSize: 12, fontWeight: "700", marginBottom: 2 },
  strategyDesc: { color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 14 },
  strategyResult: { fontSize: 10, fontWeight: "600", marginTop: 3, lineHeight: 14 },
  playBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center", flexShrink: 0, marginLeft: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#111", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 13, fontWeight: "800" },
  modalGroup: { fontSize: 10, marginTop: 2, fontWeight: "600" },
  modalClose: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  resolvedUrl: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", paddingHorizontal: 14, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.03)" },
  playerArea: { height: 240, backgroundColor: "#000" },
  videoPlayer: { flex: 1 },
  playerLoading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  playerLoadingText: { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  statusBar: { padding: 10, marginHorizontal: 10, marginTop: 6, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "600", lineHeight: 16 },
  closeBtn: { margin: 10, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, padding: 13, alignItems: "center" },
  closeBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

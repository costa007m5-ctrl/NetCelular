import { Platform } from "react-native";

let isExpoGo = false;
try {
  const Constants = require("expo-constants").default;
  isExpoGo = Constants.appOwnership === "expo";
} catch {}

const nativeEligible = Platform.OS !== "web" && !isExpoGo;

let RNGC: any = null;
if (nativeEligible) {
  try {
    RNGC = require("react-native-google-cast");
  } catch {
    RNGC = null;
  }
}

export const chromecastSupported = !!(RNGC && (RNGC.default || RNGC.useCastState));

export type ChromecastState =
  | "noDevicesAvailable"
  | "notConnected"
  | "connecting"
  | "connected"
  | null;

export function useChromecastState(): ChromecastState {
  if (chromecastSupported && typeof RNGC.useCastState === "function") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return RNGC.useCastState();
  }
  return null;
}

export function useChromecastClient(): any {
  if (chromecastSupported && typeof RNGC.useRemoteMediaClient === "function") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return RNGC.useRemoteMediaClient();
  }
  return null;
}

export async function openChromecastPicker(): Promise<void> {
  if (!chromecastSupported) throw new Error("Chromecast indisponível");
  const instance = RNGC.default ?? RNGC;
  if (typeof instance.showCastPicker === "function") {
    await instance.showCastPicker();
  } else if (typeof instance.showIntroductoryOverlay === "function") {
    await instance.showIntroductoryOverlay();
  } else {
    throw new Error("Seletor de Chromecast indisponível");
  }
}

export function buildCastMediaInfo(url: string, title?: string, poster?: string) {
  const isHls = url.includes(".m3u8");
  return {
    contentUrl: url,
    contentType: isHls ? "application/x-mpegurl" : "video/mp4",
    streamType: isHls ? "buffered" : "buffered",
    metadata: {
      type: "movie" as const,
      title: title ?? "NETPLAY",
      images: poster ? [{ url: poster }] : [],
    },
  };
}

export function whyChromecastUnavailable(): string | null {
  if (Platform.OS === "web") return null;
  if (isExpoGo) {
    return "Cast real do Chromecast só funciona no app instalado (não no app de testes Expo Go).";
  }
  if (!RNGC) {
    return "Este build ainda não inclui o módulo de Chromecast — gere uma nova build para ativar.";
  }
  return null;
}

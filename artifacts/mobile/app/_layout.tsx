import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import NetplaySplash from "@/components/NetplaySplash";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { CatalogProvider } from "@/lib/catalog-context";
import { requestPermissionsAndSetup, scheduleNewContentNotification, saveNotificationToHistory, checkWatchlistNotifications } from "@/lib/notifications";
import { checkAndPromptUpdate } from "@/lib/app-updater";
import { supabase } from "@/lib/supabase";
import { initApiDomain } from "@/lib/api";
import { startBackgroundPrefetch } from "@/lib/flix2-prefetch";

SystemUI.setBackgroundColorAsync("#000000");
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function NotificationHandler() {
  const router = useRouter();

  /* Resolve the destination from notification data and navigate */
  const handleNotificationData = React.useCallback((data: any) => {
    if (!data) return;
    try {
      // Resolve the content type: may come as `contentType` (new) or `type` (legacy) when it's movie/tv
      const contentType: string =
        data.contentType ?? (data.type === "movie" || data.type === "tv" ? data.type : null);
      const tmdbId: number | null = data.tmdbId ? Number(data.tmdbId) : null;
      const title: string = data.title ?? "";
      const notifCategory: string = data.type ?? "";

      // 1. New episode: navigate directly to episodes tab
      if (notifCategory === "new_episode" && tmdbId && (contentType === "tv" || contentType === "movie")) {
        const deepLinkTo: string = (data as any)?.deepLinkTo ?? "";
        router.push({
          pathname: "/detail",
          params: { type: contentType, id: String(tmdbId), title, ...(deepLinkTo ? { tab: deepLinkTo } : {}) },
        });
        return;
      }

      // 2. Content deep-link: any notification that carries a real tmdbId + content type
      if (tmdbId && (contentType === "movie" || contentType === "tv")) {
        router.push({
          pathname: "/detail",
          params: { type: contentType, id: String(tmdbId), title },
        });
        return;
      }

      // 3. Continue watching: has tmdbId/contentType embedded
      if (notifCategory === "continue_watching" && tmdbId && contentType) {
        router.push({
          pathname: "/detail",
          params: { type: contentType, id: String(tmdbId), title },
        });
        return;
      }

      // 3. New content / weekly digest → Novidades tab
      if (notifCategory === "new_content" || notifCategory === "weekly_digest") {
        router.push("/(tabs)/novidades");
        return;
      }

      // 4. Plan / guest upgrade → Profile tab
      if (notifCategory === "plan_expiry" || notifCategory === "guest_upgrade") {
        router.push("/(tabs)/profile");
        return;
      }
    } catch {}
  }, [router]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let receivedSub: any;
    let responseSub: any;
    try {
      const Notifications = require("expo-notifications");

      // ── Cold-start: app was closed, opened via notification tap ──
      Notifications.getLastNotificationResponseAsync().then((response: any) => {
        if (response) {
          // Small delay to ensure the navigator is mounted
          setTimeout(() => {
            handleNotificationData(response?.notification?.request?.content?.data);
          }, 500);
        }
      }).catch(() => {});

      // ── Foreground: save notification to history ──
      receivedSub = Notifications.addNotificationReceivedListener((notification: any) => {
        try {
          const content = notification?.request?.content;
          if (content?.title) {
            saveNotificationToHistory({
              title: content.title,
              body: content.body ?? "",
              imageUrl: content.attachments?.[0]?.url,
              receivedAt: new Date().toISOString(),
              data: content.data ?? {},
            }).catch(() => {});
          }
        } catch {}
      });

      // ── Background/foreground tap: navigate to content ──
      responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
        try {
          handleNotificationData(response?.notification?.request?.content?.data);
        } catch {}
      });
    } catch {}
    return () => {
      try { receivedSub?.remove?.(); } catch {}
      try { responseSub?.remove?.(); } catch {}
    };
  }, [router, handleNotificationData]);

  return null;
}

function WatchlistNotificationChecker() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      checkWatchlistNotifications(user.id).catch(() => {});
    }, 6000);
    return () => clearTimeout(t);
  }, [user?.id]);
  return null;
}

/**
 * Inicia o download em segundo plano de todo o catálogo Flix 2.0.
 * Aguarda 5s após o app estar pronto para não atrasar a tela inicial.
 */
function CatalogPrefetcher() {
  const { loading: authLoading } = useAuth();
  const startedRef = React.useRef(false);

  useEffect(() => {
    if (authLoading) return;              // aguarda auth resolver
    if (startedRef.current) return;
    startedRef.current = true;

    const t = setTimeout(() => {
      startBackgroundPrefetch().catch(() => {});
    }, 5000);

    return () => clearTimeout(t);
  }, [authLoading]);

  return null;
}

function RootNavigator() {
  const { loading } = useAuth();

  if (loading) return null;

  return (
    <>
      <NotificationHandler />
      <WatchlistNotificationChecker />
      <CatalogPrefetcher />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="email-confirmed" options={{ headerShown: false }} />
        <Stack.Screen name="profile-select" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/profile" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/preferences" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="detail" options={{ headerShown: false }} />
        <Stack.Screen name="catalog-list" options={{ headerShown: false }} />
        <Stack.Screen name="channel-detail" options={{ headerShown: false }} />
        <Stack.Screen name="player" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="gdrive-player" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="admin-user" options={{ headerShown: false }} />
        <Stack.Screen name="r2-catalog" options={{ headerShown: false }} />
        <Stack.Screen name="r2-player" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="notification-history" options={{ headerShown: false }} />
        <Stack.Screen name="buscar" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

async function handleAuthUrl(url: string) {
  try {
    const fragment = url.split("#")[1] ?? "";
    const query = url.includes("?") ? url.split("?")[1]?.split("#")[0] ?? "" : "";
    const params = new URLSearchParams(fragment || query);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  } catch {}
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontTimeout, setFontTimeout] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setFontTimeout(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        const NavBar = await import("expo-navigation-bar");
        await NavBar.setBackgroundColorAsync("#000000");
        await NavBar.setButtonStyleAsync("light");
      } catch {}
    })();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handleAuthUrl(url));
    return () => sub.remove();
  }, []);

  const ready = fontsLoaded || fontError || fontTimeout;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    initApiDomain().catch(() => {});
  }, []);

  useEffect(() => {
    requestPermissionsAndSetup().then((granted) => {
      if (granted) scheduleNewContentNotification().catch(() => {});
    });
    // Check for OTA updates 3 seconds after launch (non-blocking)
    const updateTimer = setTimeout(() => {
      checkAndPromptUpdate(true).catch(() => {});
    }, 3000);
    return () => clearTimeout(updateTimer);
  }, []);

  const handleSplashFinish = () => setShowSplash(false);

  if (!ready) return <View style={{ flex: 1, backgroundColor: "#000" }} />;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <CatalogProvider>
              <QueryClientProvider client={queryClient}>
                <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
                  <KeyboardProvider>
                    <View style={{ flex: 1 }}>
                      <RootNavigator />
                      {showSplash && <NetplaySplash onFinish={handleSplashFinish} />}
                    </View>
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </QueryClientProvider>
            </CatalogProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

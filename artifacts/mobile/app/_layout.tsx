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
import { requestPermissionsAndSetup, scheduleNewContentNotification } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

SystemUI.setBackgroundColorAsync("#000000");
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: any;
    try {
      const Notifications = require("expo-notifications");
      sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
        try {
          const data = response?.notification?.request?.content?.data;
          const tmdbId = data?.tmdbId;
          const type = data?.type;
          const title = data?.title ?? "";
          if (tmdbId && type) {
            router.push({
              pathname: "/detail",
              params: { type, id: String(tmdbId), title },
            });
          }
        } catch {}
      });
    } catch {}
    return () => { try { sub?.remove?.(); } catch {} };
  }, [router]);

  return null;
}

function RootNavigator() {
  const { loading } = useAuth();

  if (loading) return null;

  return (
    <>
      <NotificationHandler />
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
        <Stack.Screen name="admin" options={{ headerShown: false }} />
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
    requestPermissionsAndSetup().then((granted) => {
      if (granted) scheduleNewContentNotification().catch(() => {});
    });
  }, []);

  const handleSplashFinish = () => setShowSplash(false);

  if (!ready) return null;

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

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import NetplaySplash from "@/components/NetplaySplash";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { requestPermissionsAndSetup, scheduleNewContentNotification } from "@/lib/notifications";

SystemUI.setBackgroundColorAsync("#000000");
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootNavigator() {
  const { loading } = useAuth();

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="profile-select" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="detail" options={{ headerShown: false }} />
      <Stack.Screen name="channel-detail" options={{ headerShown: false }} />
      <Stack.Screen name="player" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
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
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

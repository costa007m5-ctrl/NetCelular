import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";

const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";

function NativeTabLayout({ isAdmin }: { isAdmin: boolean }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Início</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="novidades">
        <Icon sf={{ default: "sparkles", selected: "sparkles" }} />
        <Label>Novidades</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="franquias">
        <Icon sf={{ default: "star", selected: "star.fill" }} />
        <Label>Franquias</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="descobrir">
        <Icon sf={{ default: "dot.radiowaves.left.and.right", selected: "dot.radiowaves.left.and.right" }} />
        <Label>Ao Vivo</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Perfil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ isAdmin }: { isAdmin: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";

  const bottomInset = isWeb ? 34 : isAndroid ? Math.max(insets.bottom, 48) + 24 : Math.max(insets.bottom, 4) + 8;
  const tabBarHeight = 64;

  return (
    <Tabs
      safeAreaInsets={{ top: 0, bottom: 0 }}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "rgba(255,255,255,0.35)",
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          bottom: bottomInset,
          left: 18,
          right: 18,
          height: tabBarHeight,
          borderRadius: 32,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, styles.tabBg, { borderRadius: 32 }]}>
              {isIOS ? (
                <BlurView
                  intensity={95}
                  tint="dark"
                  style={[StyleSheet.absoluteFill, { borderRadius: 32, overflow: "hidden" }]}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { borderRadius: 32, backgroundColor: "rgba(10,10,10,0.97)" }]} />
              )}
              <View style={[styles.tabBorder, { borderRadius: 32 }]} />
            </View>
            {isAndroid && (
              <View
                style={{
                  position: "absolute",
                  top: tabBarHeight,
                  left: -18,
                  right: -18,
                  bottom: -220,
                  backgroundColor: "#000",
                }}
              />
            )}
          </View>
        ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.1,
          marginBottom: 4,
        },
        tabBarIconStyle: { marginTop: 6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Início",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="house" tintColor={color} size={22} /> : <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="novidades"
        options={{
          title: "Novidades",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="sparkles" tintColor={color} size={22} /> : <Feather name="bell" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="franquias"
        options={{
          title: "Franquias",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="star" tintColor={color} size={22} /> : <Feather name="star" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="descobrir"
        options={{
          title: "Ao Vivo",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="dot.radiowaves.left.and.right" tintColor={color} size={22} /> : <Feather name="wifi" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person" tintColor={color} size={22} /> : <Feather name="user" size={22} color={color} />,
        }}
      />
      {/* Hidden screens — accessible via router.push */}
      <Tabs.Screen name="channels" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="downloads" options={{ href: null }} />
      <Tabs.Screen name="list" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  const [profileChecking, setProfileChecking] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    if (!user) { setProfileChecking(false); return; }
    AsyncStorage.getItem(ACTIVE_PROFILE_KEY)
      .then((raw) => {
        if (raw) {
          const profile = JSON.parse(raw);
          setHasProfile(profile?.userId === user.id);
        } else {
          setHasProfile(false);
        }
      })
      .catch(() => setHasProfile(false))
      .finally(() => setProfileChecking(false));
  }, [user]);

  if (loading || profileChecking) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#e50914" size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/welcome" />;
  if (!hasProfile) return <Redirect href="/profile-select" />;

  const isAdmin = user.role === "admin";

  if (Platform.OS === "ios") return <NativeTabLayout isAdmin={isAdmin} />;
  return <ClassicTabLayout isAdmin={isAdmin} />;
}

const styles = StyleSheet.create({
  tabBg: { flex: 1, overflow: "hidden" },
  tabBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
});

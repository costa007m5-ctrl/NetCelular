import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Início</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label>Buscar</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="channels">
        <Icon sf={{ default: "tv", selected: "tv.fill" }} />
        <Label>Canais</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="novidades">
        <Icon sf={{ default: "star", selected: "star.fill" }} />
        <Label>Novidades</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Perfil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const tabBarBottom = isWeb ? 34 : 20;
  const tabBarHeight = 62;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "rgba(255,255,255,0.35)",
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          bottom: tabBarBottom,
          left: 20,
          right: 20,
          height: tabBarHeight,
          borderRadius: 31,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => (
          <View style={[styles.tabBg, { borderRadius: 31 }]}>
            {isIOS ? (
              <BlurView
                intensity={80}
                tint="dark"
                style={[StyleSheet.absoluteFill, { borderRadius: 31, overflow: "hidden" }]}
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { borderRadius: 31, backgroundColor: "rgba(14,14,14,0.92)" },
                ]}
              />
            )}
            <View style={[styles.tabBorder, { borderRadius: 31 }]} />
          </View>
        ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.2,
          marginBottom: 4,
        },
        tabBarIconStyle: {
          marginTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Início",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={22} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Buscar",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="magnifyingglass" tintColor={color} size={22} />
            ) : (
              <Feather name="search" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="channels"
        options={{
          title: "Canais",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="tv" tintColor={color} size={22} />
            ) : (
              <Feather name="tv" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="novidades"
        options={{
          title: "Novidades",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="star" tintColor={color} size={22} />
            ) : (
              <Feather name="star" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen name="list" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={22} />
            ) : (
              <Feather name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#e50914" size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (Platform.OS === "ios") {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  tabBg: {
    flex: 1,
    overflow: "hidden",
  },
  tabBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
});

import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";

let SymbolView: React.ComponentType<{ name: string; tintColor?: string; size?: number }> | null = null;
if (Platform.OS === "ios") {
  SymbolView = require("expo-symbols").SymbolView;
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
            isIOS && SymbolView ? (
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
            isIOS && SymbolView ? (
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
            isIOS && SymbolView ? (
              <SymbolView name="tv" tintColor={color} size={22} />
            ) : (
              <Feather name="tv" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: "Lista",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="bookmark" tintColor={color} size={22} />
            ) : (
              <Feather name="bookmark" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
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

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";

interface AdminGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const ADMIN_EMAILS = ["admin@netplay.tv", "admin@netplay.com.br"];

export function AdminGuard({ children, fallback }: AdminGuardProps) {
  const { user } = useAuth();
  const colors = useColors();

  const isAdmin = user &&
    (user.role === "admin" ||
     (user.email && ADMIN_EMAILS.includes(user.email)));

  if (!isAdmin) {
    if (fallback) return <>{fallback}</>;
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}20` }]}>
          <Feather name="lock" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Acesso restrito</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Esta área é exclusiva para administradores do NETPLAY.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
});

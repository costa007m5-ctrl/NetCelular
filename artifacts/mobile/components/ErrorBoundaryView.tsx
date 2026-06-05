import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface ErrorBoundaryViewProps {
  error?: string;
  onRetry?: () => void;
  minimal?: boolean;
}

export function ErrorBoundaryView({ error, onRetry, minimal = false }: ErrorBoundaryViewProps) {
  const colors = useColors();

  if (minimal) {
    return (
      <View style={[styles.minimal, { borderColor: colors.border }]}>
        <Feather name="alert-circle" size={16} color={colors.mutedForeground} />
        <Text style={[styles.minimalText, { color: colors.mutedForeground }]}>
          {error ?? "Erro ao carregar"}
        </Text>
        {onRetry && (
          <Pressable onPress={onRetry}>
            <Feather name="refresh-cw" size={14} color={colors.primary} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}20` }]}>
        <Feather name="alert-triangle" size={36} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>Algo deu errado</Text>
      {error && (
        <Text style={[styles.message, { color: colors.mutedForeground }]}>{error}</Text>
      )}
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="refresh-cw" size={16} color="#fff" />
          <Text style={styles.retryText}>Tentar novamente</Text>
        </Pressable>
      )}
    </View>
  );
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
    width: 80,
    height: 80,
    borderRadius: 24,
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
  message: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 6,
  },
  retryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  minimal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    margin: 20,
  },
  minimalText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
});

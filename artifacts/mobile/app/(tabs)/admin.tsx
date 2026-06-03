import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";

export default function AdminTab() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin");
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color="#e50914" size="large" />
    </View>
  );
}

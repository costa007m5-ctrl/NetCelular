import React, { useEffect, useState } from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";

const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";
const RED = "#e50914";

interface ActiveProfile {
  name?: string;
  avatarUrl?: string;
  userId?: string;
}

export function ProfileAvatarButton() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeProfile, setActiveProfile] = useState<ActiveProfile | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_PROFILE_KEY)
      .then((raw) => { if (raw) setActiveProfile(JSON.parse(raw)); })
      .catch(() => {});
  }, [user]);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => router.push("/(tabs)/profile")}
      activeOpacity={0.75}
    >
      {activeProfile?.avatarUrl ? (
        <Image
          source={{ uri: activeProfile.avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
        />
      ) : (
        <LinearGradient colors={[RED, "#b5060f"]} style={styles.avatar}>
          <Text style={styles.letter}>
            {(activeProfile?.name ?? user?.name ?? "N")[0]?.toUpperCase()}
          </Text>
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
});

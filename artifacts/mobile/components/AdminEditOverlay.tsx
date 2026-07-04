import React, { useState } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { EditPosterModal } from "@/components/EditPosterModal";

interface AdminEditOverlayProps {
  itemKey: string;
  title: string;
  type?: "movie" | "series" | "tv" | string;
  onSaved?: () => void;
}

/**
 * Drop-in admin-only edit button + modal. Renders nothing for non-admin users.
 * Parent container must have position: "relative" (or be a View that supports absolute children).
 */
export function AdminEditOverlay({ itemKey, title, type, onSaved }: AdminEditOverlayProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [visible, setVisible] = useState(false);

  if (!isAdmin) return null;

  return (
    <>
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation?.(); setVisible(true); }}
        style={s.btn}
        hitSlop={8}
        activeOpacity={0.75}
      >
        <Feather name="edit-2" size={11} color="#fff" />
      </TouchableOpacity>
      <EditPosterModal
        visible={visible}
        onClose={() => setVisible(false)}
        itemKey={itemKey}
        initialTitle={title}
        initialType={type === "series" || type === "tv" ? "series" : "movie"}
        onSaved={onSaved}
      />
    </>
  );
}

const s = StyleSheet.create({
  btn: {
    position: "absolute", top: 6, left: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
    zIndex: 20,
  },
});

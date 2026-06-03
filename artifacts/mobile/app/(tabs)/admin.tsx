import React, { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";

export default function AdminTab() {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      router.navigate("/admin");
    }, [router])
  );
  return null;
}

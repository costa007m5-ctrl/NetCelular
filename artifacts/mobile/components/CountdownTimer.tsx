import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface CountdownTimerProps {
  targetDate: Date | string;
  label?: string;
  onExpire?: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function CountdownTimer({ targetDate, label, onExpire }: CountdownTimerProps) {
  const colors = useColors();
  const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;

  const getRemaining = () => {
    const diff = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
    return {
      days: Math.floor(diff / 86400),
      hours: Math.floor((diff % 86400) / 3600),
      minutes: Math.floor((diff % 3600) / 60),
      seconds: diff % 60,
      expired: diff === 0,
    };
  };

  const [time, setTime] = useState(getRemaining);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const r = getRemaining();
      setTime(r);
      if (r.expired) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onExpire?.();
      }
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (time.expired) {
    return (
      <View style={styles.expired}>
        <Feather name="check-circle" size={14} color={colors.accentGreen} />
        <Text style={[styles.expiredText, { color: colors.accentGreen }]}>Disponível agora</Text>
      </View>
    );
  }

  const units = [
    { label: "dias", value: time.days },
    { label: "hrs", value: time.hours },
    { label: "min", value: time.minutes },
    { label: "seg", value: time.seconds },
  ];

  return (
    <View style={styles.wrap}>
      {label && (
        <Text style={[styles.mainLabel, { color: colors.mutedForeground }]}>{label}</Text>
      )}
      <View style={styles.units}>
        {units.map((u, i) => (
          <React.Fragment key={u.label}>
            <View style={[styles.unit, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.value, { color: colors.foreground }]}>{pad(u.value)}</Text>
              <Text style={[styles.unitLabel, { color: colors.mutedForeground }]}>{u.label}</Text>
            </View>
            {i < units.length - 1 && (
              <Text style={[styles.colon, { color: colors.mutedForeground }]}>:</Text>
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 8,
  },
  mainLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  units: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unit: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 46,
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  unitLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 1,
  },
  colon: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  expired: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  expiredText: {
    fontSize: 13,
    fontWeight: "700",
  },
});

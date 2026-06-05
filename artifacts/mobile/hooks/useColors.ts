import { useTheme } from "@/lib/theme-context";
import { palette } from "@/constants/colors";

export function useColors() {
  const { resolvedTheme } = useTheme();
  const p = resolvedTheme === "light" ? palette.light : palette.dark;
  return { ...p, radius: palette.radius };
}

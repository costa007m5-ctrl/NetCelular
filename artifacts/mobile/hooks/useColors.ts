import { useTheme } from "@/lib/theme-context";
import { palette } from "@/constants/colors";

export function useColors() {
  const { theme } = useTheme();
  const p = theme === "light" ? palette.light : palette.dark;
  return { ...p, radius: 16 };
}

/** Convert a hex color to rgba string */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mix two hex colors at a given ratio (0=color1, 1=color2) */
export function mixColors(color1: string, color2: string, ratio: number): string {
  const c1 = color1.replace("#", "");
  const c2 = color2.replace("#", "");
  const r1 = parseInt(c1.slice(0, 2), 16);
  const g1 = parseInt(c1.slice(2, 4), 16);
  const b1 = parseInt(c1.slice(4, 6), 16);
  const r2 = parseInt(c2.slice(0, 2), 16);
  const g2 = parseInt(c2.slice(2, 4), 16);
  const b2 = parseInt(c2.slice(4, 6), 16);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Check if a color is "light" (for text contrast) */
export function isLightColor(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/** Get contrasting text color (black or white) for a given background */
export function contrastText(hex: string): "#000000" | "#ffffff" {
  return isLightColor(hex) ? "#000000" : "#ffffff";
}

/** Generate a color from a string (deterministic) */
export function stringToColor(str: string): string {
  const COLORS = [
    "#e50914", "#3b82f6", "#a78bfa", "#22c55e",
    "#f59e0b", "#ec4899", "#06b6d4", "#f97316",
    "#10b981", "#6366f1",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

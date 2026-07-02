const LOGOS: Record<string, number> = {
  looke: require("../assets/logos/looke.png"),
  universal: require("../assets/logos/universal.png"),
};

export function getLocalLogo(platformId: string): number | null {
  return LOGOS[platformId] ?? null;
}

import { Dimensions } from "react-native";

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const APP_NAME = "NETPLAY";
export const APP_VERSION = "2.0.0";

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export const PAGINATION_BATCH_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 350;
export const MAX_RECENT_SEARCHES = 10;
export const MAX_ANALYTICS_EVENTS = 200;

export const HERO_HEIGHT = 510;
export const CARD_BORDER_RADIUS = 12;
export const SECTION_SPACING = 28;
export const HORIZONTAL_PADDING = 20;

export const ANIMATION_DURATION = {
  fast: 160,
  normal: 220,
  slow: 360,
} as const;

export const SPRING_CONFIG = {
  fast: { speed: 30, bounciness: 6 },
  normal: { speed: 24, bounciness: 8 },
  slow: { speed: 18, bounciness: 10 },
} as const;

export const GENRE_IDS = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCI_FI: 878,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
} as const;

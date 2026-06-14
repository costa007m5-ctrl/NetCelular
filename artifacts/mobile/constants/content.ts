export type ContentItem = {
  id: string;
  tmdbId?: number;
  title: string;
  originalTitle?: string;
  year: number;
  rating: number;
  communityScore?: number;
  posterPath: string;
  backdropPath: string;
  description: string;
  genres: (string | number)[];
  type: "movie" | "series";
  mediaType?: "movie" | "tv";
  releaseDate?: string;
  duration?: string;
  progress?: number;
  channel?: string;
  exclusive?: boolean;
};

const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w780";

export const p = (path: string) => `${TMDB_POSTER}${path}`;
export const b = (path: string) => `${TMDB_BACKDROP}${path}`;

export const HERO_ITEMS: ContentItem[] = [
  {
    id: "1",
    title: "Oppenheimer",
    year: 2023,
    rating: 8.3,
    communityScore: 96,
    posterPath: p("/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg"),
    backdropPath: b("/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg"),
    description:
      "A história do físico americano J. Robert Oppenheimer e seu papel no desenvolvimento da bomba atômica.",
    genres: ["Drama", "História", "Thriller"],
    type: "movie",
    duration: "3h",
    channel: "NETPLAY",
  },
  {
    id: "2",
    title: "Duna: Parte 2",
    year: 2024,
    rating: 8.5,
    communityScore: 98,
    posterPath: p("/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg"),
    backdropPath: b("/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"),
    description:
      "Paul Atreides une forças com Chani e os Fremen enquanto procura vingança contra os conspiradores que destruíram sua família.",
    genres: ["Ficção Científica", "Aventura", "Drama"],
    type: "movie",
    duration: "2h46min",
    channel: "NETPLAY",
  },
  {
    id: "3",
    title: "The Last of Us",
    year: 2023,
    rating: 8.8,
    communityScore: 99,
    posterPath: p("/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg"),
    backdropPath: b("/uDgy6hyPd82kOHh6I95kkZaEKc.jpg"),
    description:
      "Após uma pandemia devastadora, um sobrevivente endurecido é contratado para contrabandear uma menina de 14 anos para fora de uma zona de quarentena.",
    genres: ["Drama", "Terror", "Aventura"],
    type: "series",
    channel: "HBO",
  },
];

export const TOP_10_SERIES: ContentItem[] = [
  {
    id: "t1",
    title: "Breaking Bad",
    year: 2008,
    rating: 9.5,
    posterPath: p("/ggFHVNu6YYI5L9pCfOacjizRGt.jpg"),
    backdropPath: b("/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg"),
    description: "Um professor de química do ensino médio diagnosticado com câncer se torna fabricante de metanfetamina.",
    genres: ["Crime", "Drama", "Thriller"],
    type: "series",
    channel: "NETPLAY",
  },
  {
    id: "t2",
    title: "Stranger Things",
    year: 2016,
    rating: 8.7,
    posterPath: p("/49WJfeN0moxb9IPfGn8AIqMGskD.jpg"),
    backdropPath: b("/56v2KjBlU4XaOv9rVYEQypROD7P.jpg"),
    description: "Quando um garoto desaparece, uma cidade descobre um mistério envolvendo experimentos secretos e forças sobrenaturais.",
    genres: ["Drama", "Fantasia", "Terror"],
    type: "series",
    channel: "NETFLIX",
  },
  {
    id: "t3",
    title: "The Last of Us",
    year: 2023,
    rating: 8.8,
    posterPath: p("/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg"),
    backdropPath: b("/uDgy6hyPd82kOHh6I95kkZaEKc.jpg"),
    description: "Pós-apocalipse com vírus fungal transforma humanos em criaturas.",
    genres: ["Drama", "Terror"],
    type: "series",
    channel: "HBO",
  },
  {
    id: "t4",
    title: "Oppenheimer",
    year: 2023,
    rating: 8.3,
    posterPath: p("/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg"),
    backdropPath: b("/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg"),
    description: "Criador da bomba atômica e o peso de sua invenção.",
    genres: ["Drama", "História"],
    type: "movie",
    channel: "NETPLAY",
  },
  {
    id: "t5",
    title: "Duna: Parte 2",
    year: 2024,
    rating: 8.5,
    posterPath: p("/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg"),
    backdropPath: b("/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"),
    description: "Paul Atreides e a batalha pelo destino do universo.",
    genres: ["Ficção Científica"],
    type: "movie",
    channel: "NETPLAY",
  },
];

export const TRENDING: ContentItem[] = [
  {
    id: "tr1",
    title: "Godzilla x Kong",
    year: 2024,
    rating: 6.3,
    posterPath: p("/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg"),
    backdropPath: b("/hkxxMIGaiCTmrEArK7J56iorHQD.jpg"),
    description: "Os titãs colossos se unem contra uma ameaça oculta nas profundezas da Terra Oca.",
    genres: ["Ação", "Ficção Científica", "Aventura"],
    type: "movie",
    channel: "NETPLAY",
  },
  {
    id: "tr2",
    title: "Aquaman 2",
    year: 2023,
    rating: 5.9,
    posterPath: p("/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg"),
    backdropPath: b("/326CoFcyFtBmGd3RFwjgeOiCjoa.jpg"),
    description: "Arthur Curry precisa de aliar a um improvável parceiro para proteger Atlantis.",
    genres: ["Ação", "Aventura", "Fantasia"],
    type: "movie",
    channel: "NETPLAY",
  },
  {
    id: "tr3",
    title: "Oppenheimer",
    year: 2023,
    rating: 8.3,
    posterPath: p("/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg"),
    backdropPath: b("/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg"),
    description: "A história do físico que criou a bomba atômica.",
    genres: ["Drama", "História"],
    type: "movie",
    channel: "NETPLAY",
  },
  {
    id: "tr4",
    title: "Duna: Parte 2",
    year: 2024,
    rating: 8.5,
    posterPath: p("/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg"),
    backdropPath: b("/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"),
    description: "A batalha épica pelo universo continua.",
    genres: ["Ficção Científica"],
    type: "movie",
    channel: "NETPLAY",
  },
  {
    id: "tr5",
    title: "The Last of Us",
    year: 2023,
    rating: 8.8,
    posterPath: p("/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg"),
    backdropPath: b("/uDgy6hyPd82kOHh6I95kkZaEKc.jpg"),
    description: "Sobrevivência numa América pós-apocalíptica.",
    genres: ["Drama", "Terror"],
    type: "series",
    channel: "HBO",
  },
  {
    id: "tr6",
    title: "Joker: Folie à Deux",
    year: 2024,
    rating: 5.2,
    posterPath: p("/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg"),
    backdropPath: b("/avedvodAZUcwqevBfm8p4G2NziQ.jpg"),
    description: "Coringa enfrenta um julgamento enquanto descobre um amor no asilo de Arkham.",
    genres: ["Crime", "Drama", "Musical"],
    type: "movie",
    channel: "NETPLAY",
  },
];

export const CONTINUE_WATCHING: ContentItem[] = [
  {
    id: "c1",
    title: "The Last of Us",
    year: 2023,
    rating: 8.8,
    posterPath: p("/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg"),
    backdropPath: b("/uDgy6hyPd82kOHh6I95kkZaEKc.jpg"),
    description: "Ep. 5 — Endure and Survive",
    genres: ["Drama", "Terror"],
    type: "series",
    progress: 0.35,
    channel: "HBO",
  },
  {
    id: "c2",
    title: "Breaking Bad",
    year: 2008,
    rating: 9.5,
    posterPath: p("/ggFHVNu6YYI5L9pCfOacjizRGt.jpg"),
    backdropPath: b("/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg"),
    description: "Temp. 3 — Ep. 7 — One Minute",
    genres: ["Crime", "Drama"],
    type: "series",
    progress: 0.7,
    channel: "NETPLAY",
  },
  {
    id: "c3",
    title: "Oppenheimer",
    year: 2023,
    rating: 8.3,
    posterPath: p("/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg"),
    backdropPath: b("/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg"),
    description: "1h22min restantes",
    genres: ["Drama", "História"],
    type: "movie",
    progress: 0.52,
    channel: "NETPLAY",
  },
];

export const MY_LIST: ContentItem[] = [
  {
    id: "m1",
    title: "Oppenheimer",
    year: 2023,
    rating: 8.3,
    posterPath: p("/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg"),
    backdropPath: b("/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg"),
    description: "",
    genres: ["Drama"],
    type: "movie",
    channel: "NETPLAY",
  },
  {
    id: "m2",
    title: "Joker: Folie à Deux",
    year: 2024,
    rating: 5.2,
    posterPath: p("/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg"),
    backdropPath: b("/avedvodAZUcwqevBfm8p4G2NziQ.jpg"),
    description: "",
    genres: ["Crime", "Drama"],
    type: "movie",
    channel: "NETPLAY",
  },
  {
    id: "m3",
    title: "Breaking Bad",
    year: 2008,
    rating: 9.5,
    posterPath: p("/ggFHVNu6YYI5L9pCfOacjizRGt.jpg"),
    backdropPath: b("/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg"),
    description: "",
    genres: ["Crime", "Drama"],
    type: "series",
    channel: "NETPLAY",
  },
  {
    id: "m4",
    title: "Duna: Parte 2",
    year: 2024,
    rating: 8.5,
    posterPath: p("/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg"),
    backdropPath: b("/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"),
    description: "",
    genres: ["Ficção Científica"],
    type: "movie",
    channel: "NETPLAY",
  },
];

export const CHANNELS = [
  { id: "ch1", name: "Netflix", color: "#e50914", logo: "N" },
  { id: "ch2", name: "Disney+", color: "#0072d2", logo: "D+" },
  { id: "ch3", name: "HBO Max", color: "#4b1082", logo: "HBO" },
  { id: "ch4", name: "Prime Video", color: "#00a8e1", logo: "prime" },
  { id: "ch5", name: "Apple TV+", color: "#555555", logo: "" },
  { id: "ch6", name: "Paramount+", color: "#0064ff", logo: "P+" },
];

export const CATEGORIES = [
  { id: "all", label: "Tudo" },
  { id: "series", label: "Séries" },
  { id: "movies", label: "Filmes" },
  { id: "anime", label: "Anime" },
  { id: "docs", label: "Docs" },
];

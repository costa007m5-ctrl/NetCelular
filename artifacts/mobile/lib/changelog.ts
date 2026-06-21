export type ChangelogEntry = {
  version: string;
  date: string;
  highlights: {
    icon: string;
    title: string;
    description: string;
  }[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.0",
    date: "Junho 2025",
    highlights: [
      {
        icon: "⚡",
        title: "Performance melhorada",
        description: "App mais rápido ao abrir e navegar entre telas.",
      },
      {
        icon: "🎬",
        title: "Novos conteúdos",
        description: "Catálogo atualizado com lançamentos de filmes e séries.",
      },
      {
        icon: "🔔",
        title: "Notificações aprimoradas",
        description: "Receba avisos de novos episódios dos seus favoritos.",
      },
      {
        icon: "🛠️",
        title: "Correções gerais",
        description: "Diversos bugs corrigidos para uma experiência mais estável.",
      },
    ],
  },
];

export function getChangelogForVersion(version: string): ChangelogEntry | null {
  return CHANGELOG.find((c) => c.version === version) ?? null;
}

import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* Primary SEO */}
        <title>NETPLAY — Catálogo Premium de Filmes e Séries</title>
        <meta
          name="description"
          content="Descubra e assista aos melhores filmes e séries em streaming. Catálogo premium atualizado com os lançamentos mais recentes do cinema e TV."
        />
        <meta name="keywords" content="filmes, séries, streaming, catálogo, assistir online, NETPLAY" />
        <meta name="author" content="NETPLAY" />
        <meta name="robots" content="index, follow" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="NETPLAY — Catálogo Premium de Filmes e Séries" />
        <meta
          property="og:description"
          content="Descubra e assista aos melhores filmes e séries em streaming. Catálogo premium atualizado com os lançamentos mais recentes."
        />
        <meta property="og:site_name" content="NETPLAY" />
        <meta property="og:locale" content="pt_BR" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="NETPLAY — Catálogo Premium de Filmes e Séries" />
        <meta
          name="twitter:description"
          content="Descubra e assista aos melhores filmes e séries em streaming. Catálogo premium atualizado."
        />

        {/* Theme & App */}
        <meta name="theme-color" content="#000000" />
        <meta name="application-name" content="NETPLAY" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="NETPLAY" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        {/* Performance: preconnect to TMDB image CDN */}
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

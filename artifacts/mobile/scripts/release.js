#!/usr/bin/env node
/**
 * NETPLAY — Script de publicação de atualização
 * Uso: node scripts/release.js
 *
 * O que faz automaticamente:
 *  1. Pergunta a nova versão e o que mudou
 *  2. Atualiza app.json
 *  3. Atualiza lib/changelog.ts
 *  4. Roda eas update --channel production
 */

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

const ROOT         = path.resolve(__dirname, "..");
const APP_JSON     = path.join(ROOT, "app.json");
const CHANGELOG_TS = path.join(ROOT, "lib", "changelog.ts");

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const ICON_OPTIONS = ["⚡","🎬","🔔","🛠️","🎉","🌟","🚀","🔒","🎨","📺","🎵","🐛","✨","🆕","💡"];

// ── Utils ──────────────────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function color(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

const bold  = (t) => color("1",    t);
const red   = (t) => color("1;31", t);
const green = (t) => color("1;32", t);
const cyan  = (t) => color("1;36", t);
const gray  = (t) => color("90",   t);
const dim   = (t) => color("2",    t);

function header(text) {
  console.log("\n" + bold("─".repeat(50)));
  console.log("  " + bold(text));
  console.log(bold("─".repeat(50)));
}

function step(n, text) {
  console.log("\n" + cyan(`[${n}]`) + " " + bold(text));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.clear();
  console.log(red("███╗   ██╗███████╗████████╗██████╗ ██╗      █████╗ ██╗   ██╗"));
  console.log(red("████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██║     ██╔══██╗╚██╗ ██╔╝"));
  console.log(red("██╔██╗ ██║█████╗     ██║   ██████╔╝██║     ███████║ ╚████╔╝ "));
  console.log(red("██║╚██╗██║██╔══╝     ██║   ██╔═══╝ ██║     ██╔══██║  ╚██╔╝  "));
  console.log(red("██║ ╚████║███████╗   ██║   ██║     ███████╗██║  ██║   ██║   "));
  console.log(red("╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝   "));
  console.log(bold("\n          🚀 Script de Publicação de Atualização\n"));

  // ── Verifica EXPO_TOKEN ──────────────────────────────────────────────────────
  if (!process.env.EXPO_TOKEN) {
    console.log(red("\n  ✗ EXPO_TOKEN não encontrado."));
    console.log(dim("  Adicione seu token em: Replit → Secrets → EXPO_TOKEN"));
    console.log(dim("  Gere o token em: expo.dev → Account Settings → Access Tokens"));
    process.exit(1);
  }
  console.log(green("  ✓ EXPO_TOKEN encontrado — login automático ativo\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── Lê versão atual ──────────────────────────────────────────────────────────
  const appJson     = JSON.parse(fs.readFileSync(APP_JSON, "utf-8"));
  const currentVer  = appJson.expo.version;
  const [maj, min, patch] = currentVer.split(".").map(Number);
  const suggestedVer = `${maj}.${min}.${patch + 1}`;

  step(1, "Versão");
  console.log(dim(`  Versão atual: ${currentVer}`));
  // strip invisible/non-printable chars that mobile keyboards sometimes inject
  const rawVersion = (await ask(rl, `  Nova versão ${gray(`[Enter = ${suggestedVer}]`)}: `));
  const newVersion = rawVersion.replace(/[^\d.]/g, "").trim() || suggestedVer;
  console.log(dim(`  Usando versão: ${newVersion}`));

  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.log(red(`\n  ✗ Versão inválida: "${newVersion}". Use o formato: 1.2.3`));
    rl.close(); process.exit(1);
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  const now       = new Date();
  const dateLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // ── Highlights ───────────────────────────────────────────────────────────────
  step(2, "O que mudou? (adicione até 5 itens, Enter em branco para terminar)");
  console.log(dim("  Ícones sugeridos: " + ICON_OPTIONS.join(" ")));

  const highlights = [];
  for (let i = 1; i <= 5; i++) {
    console.log(dim(`\n  ── Item ${i} ──`));
    const title = (await ask(rl, `  Título ${gray("(Enter para terminar)")}: `)).trim();
    if (!title) break;

    const desc = (await ask(rl, "  Descrição: ")).trim() || title;
    const icon = (await ask(rl, `  Emoji ${gray("[Enter = ✨]")}: `)).trim() || "✨";

    highlights.push({ icon, title, description: desc });
    console.log(green(`  ✓ Adicionado: ${icon} ${title}`));
  }

  if (highlights.length === 0) {
    highlights.push({ icon: "🛠️", title: "Melhorias gerais", description: "Correções e melhorias de performance." });
    console.log(dim("  (Nenhum item adicionado — usando item padrão)"));
  }

  // ── Confirma ─────────────────────────────────────────────────────────────────
  header("Resumo da atualização");
  console.log(`  ${bold("Versão:")} ${currentVer}  →  ${green(newVersion)}`);
  console.log(`  ${bold("Data:")}   ${dateLabel}`);
  console.log(`  ${bold("Novidades:")}`);
  highlights.forEach((h) => console.log(`    ${h.icon}  ${bold(h.title)} — ${h.description}`));

  const confirm = (await ask(rl, "\n  Publicar agora? " + gray("[S/n]: "))).trim().toLowerCase();
  rl.close();

  if (confirm === "n" || confirm === "nao" || confirm === "não") {
    console.log(dim("\n  Cancelado."));
    process.exit(0);
  }

  // ── Atualiza app.json ────────────────────────────────────────────────────────
  step(3, "Atualizando app.json...");
  appJson.expo.version = newVersion;
  // Incrementa versionCode no Android
  if (appJson.expo.android?.versionCode != null) {
    appJson.expo.android.versionCode = Number(appJson.expo.android.versionCode) + 1;
  }
  fs.writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2) + "\n");
  console.log(green(`  ✓ Versão atualizada para ${newVersion}`));

  // ── Atualiza changelog.ts ────────────────────────────────────────────────────
  step(4, "Atualizando changelog.ts...");
  const newEntry = {
    version: newVersion,
    date: dateLabel,
    highlights,
  };

  const existingRaw = fs.readFileSync(CHANGELOG_TS, "utf-8");
  const marker      = "export const CHANGELOG: ChangelogEntry[] = [";
  const insertPos   = existingRaw.indexOf(marker) + marker.length;

  const highlightsTs = newEntry.highlights
    .map(
      (h) =>
        `      {\n        icon: ${JSON.stringify(h.icon)},\n        title: ${JSON.stringify(h.title)},\n        description: ${JSON.stringify(h.description)},\n      }`,
    )
    .join(",\n");

  const entryTs =
    `\n  {\n    version: ${JSON.stringify(newEntry.version)},\n    date: ${JSON.stringify(newEntry.date)},\n    highlights: [\n${highlightsTs},\n    ],\n  },`;

  const updatedChangelog =
    existingRaw.slice(0, insertPos) + entryTs + existingRaw.slice(insertPos);

  fs.writeFileSync(CHANGELOG_TS, updatedChangelog);
  console.log(green("  ✓ Changelog atualizado"));

  // ── EAS Update ───────────────────────────────────────────────────────────────
  step(5, "Publicando com EAS Update...");
  console.log(dim("  (isso pode levar ~1 minuto)\n"));

  try {
    execSync(
      `eas update --channel production --message "v${newVersion}: ${highlights.map((h) => h.title).join(", ")}" --non-interactive`,
      {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, EXPO_TOKEN: process.env.EXPO_TOKEN },
      },
    );
  } catch {
    console.log(red("\n  ✗ Erro no EAS Update."));
    console.log(dim('  Se ainda não fez login, rode: eas login'));
    process.exit(1);
  }

  // ── Sucesso ──────────────────────────────────────────────────────────────────
  console.log("\n" + bold("─".repeat(50)));
  console.log(green("  ✓ Atualização publicada com sucesso!"));
  console.log(`  ${bold("Versão:")} ${green(newVersion)}`);
  console.log(`  ${bold("Canal:")}  production`);
  console.log(dim("\n  Os usuários vão receber o banner de atualização"));
  console.log(dim("  na próxima vez que abrirem o app. ✨"));
  console.log(bold("─".repeat(50)) + "\n");
}

main().catch((e) => {
  console.error(red("\nErro inesperado: " + e.message));
  process.exit(1);
});

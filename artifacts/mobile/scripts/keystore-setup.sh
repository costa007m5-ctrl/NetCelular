#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NETPLAY — Keystore Setup para Codemagic
#
# Uso:
#   bash artifacts/mobile/scripts/keystore-setup.sh            → gera keystore novo
#   bash artifacts/mobile/scripts/keystore-setup.sh meu.jks    → converte existente
#
# Saída: netplay.keystore.jks + netplay.keystore.b64.txt
#        (o .txt contém o base64 e as instruções para o Codemagic)
# ─────────────────────────────────────────────────────────────────────────────

set -e

RED="\033[0;31m"
GRN="\033[0;32m"
YEL="\033[1;33m"
BLU="\033[0;34m"
CYN="\033[0;36m"
RST="\033[0m"
BOLD="\033[1m"

OUT_JKS="netplay.keystore.jks"
OUT_B64="netplay.keystore.b64.txt"

echo ""
echo -e "${BOLD}${BLU}╔══════════════════════════════════════════════════════╗${RST}"
echo -e "${BOLD}${BLU}║       NETPLAY — Android Keystore para Codemagic      ║${RST}"
echo -e "${BOLD}${BLU}╚══════════════════════════════════════════════════════╝${RST}"
echo ""

# ── Verifica se keytool está disponível ──────────────────────────────────────
if ! command -v keytool &>/dev/null; then
  echo -e "${RED}❌ 'keytool' não encontrado.${RST}"
  echo -e "   Instale o Java JDK: https://adoptium.net"
  echo -e "   Ou use: ${CYN}sudo apt-get install default-jdk${RST}"
  exit 1
fi

# ── Modo: converter existente ou gerar novo ───────────────────────────────────
if [ -n "$1" ]; then
  # ── MODO A: Converter .jks existente ────────────────────────────────────────
  INPUT_JKS="$1"

  if [ ! -f "$INPUT_JKS" ]; then
    echo -e "${RED}❌ Arquivo não encontrado: $INPUT_JKS${RST}"
    exit 1
  fi

  echo -e "${GRN}📦 Convertendo keystore existente: ${BOLD}$INPUT_JKS${RST}"
  cp "$INPUT_JKS" "$OUT_JKS"

  echo ""
  echo -e "${YEL}Digite as informações do keystore para confirmar:${RST}"
  read -r -p "  Key alias (nome da chave): " KEY_ALIAS
  read -r -s -p "  Keystore password: " KS_PASSWORD; echo ""
  read -r -s -p "  Key password (Enter = igual ao keystore): " KEY_PASSWORD; echo ""
  [ -z "$KEY_PASSWORD" ] && KEY_PASSWORD="$KS_PASSWORD"

else
  # ── MODO B: Gerar keystore novo ──────────────────────────────────────────────
  echo -e "${GRN}🔑 Gerando novo keystore Android para NETPLAY${RST}"
  echo ""
  echo -e "${YEL}Preencha os dados abaixo (serão gravados no certificado):${RST}"
  echo ""

  read -r -p "  Key alias [netplay]:            " KEY_ALIAS
  KEY_ALIAS="${KEY_ALIAS:-netplay}"

  while true; do
    read -r -s -p "  Keystore password (mín. 6 chars): " KS_PASSWORD; echo ""
    [ ${#KS_PASSWORD} -ge 6 ] && break
    echo -e "  ${RED}Senha muito curta — mínimo 6 caracteres.${RST}"
  done

  read -r -s -p "  Key password (Enter = igual ao keystore): " KEY_PASSWORD; echo ""
  [ -z "$KEY_PASSWORD" ] && KEY_PASSWORD="$KS_PASSWORD"

  echo ""
  read -r -p "  Nome (ex: NETPLAY Ltda):        " DNAME_CN
  read -r -p "  Organização (ex: NETPLAY):      " DNAME_O
  read -r -p "  Cidade (ex: São Paulo):         " DNAME_L
  read -r -p "  Estado (ex: SP):                " DNAME_ST
  read -r -p "  País (ex: BR):                  " DNAME_C

  DNAME_CN="${DNAME_CN:-NETPLAY}"
  DNAME_O="${DNAME_O:-NETPLAY}"
  DNAME_L="${DNAME_L:-São Paulo}"
  DNAME_ST="${DNAME_ST:-SP}"
  DNAME_C="${DNAME_C:-BR}"

  DNAME="CN=${DNAME_CN}, O=${DNAME_O}, L=${DNAME_L}, ST=${DNAME_ST}, C=${DNAME_C}"

  echo ""
  echo -e "${CYN}⚙️  Gerando keystore (validade: 10.000 dias ≈ 27 anos)...${RST}"

  keytool -genkeypair \
    -v \
    -storetype PKCS12 \
    -keystore "$OUT_JKS" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 4096 \
    -validity 10000 \
    -storepass "$KS_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "$DNAME" \
    2>/dev/null

  echo -e "${GRN}✅ Keystore gerado: ${BOLD}$OUT_JKS${RST}"
fi

# ── Gerar base64 ──────────────────────────────────────────────────────────────
echo ""
echo -e "${CYN}🔄 Convertendo para base64...${RST}"
B64=$(base64 < "$OUT_JKS" | tr -d '\n')

# ── Escrever arquivo de instruções ────────────────────────────────────────────
cat > "$OUT_B64" << EOF
═══════════════════════════════════════════════════════════════════════════════
  NETPLAY — Variáveis para Codemagic (App Settings → Environment variables)
═══════════════════════════════════════════════════════════════════════════════

Cole cada valor abaixo no campo correspondente em:
  Codemagic → Selecione o app → App Settings → Environment variables

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIÁVEL: CM_KEYSTORE
TIPO:     Secret (marque "Secure" / "Secret")
VALOR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${B64}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIÁVEL: CM_KEYSTORE_PASSWORD
TIPO:     Secret
VALOR:    ${KS_PASSWORD}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIÁVEL: CM_KEY_ALIAS
TIPO:     Env var (pode ser plain text)
VALOR:    ${KEY_ALIAS}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIÁVEL: CM_KEY_PASSWORD
TIPO:     Secret
VALOR:    ${KEY_PASSWORD}

═══════════════════════════════════════════════════════════════════════════════
  ⚠️  GUARDE O ARQUIVO .jks EM LOCAL SEGURO!
     Sem ele, não é possível atualizar o app nas lojas.
     Recomenda-se fazer backup em cofre de senhas (ex: Bitwarden, 1Password).
═══════════════════════════════════════════════════════════════════════════════
EOF

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GRN}╔══════════════════════════════════════════════════════╗${RST}"
echo -e "${BOLD}${GRN}║                  ✅ Concluído!                       ║${RST}"
echo -e "${BOLD}${GRN}╚══════════════════════════════════════════════════════╝${RST}"
echo ""
echo -e "  ${BOLD}Arquivos gerados:${RST}"
echo -e "  📦 ${CYN}$OUT_JKS${RST}  ← guarde em local seguro!"
echo -e "  📋 ${CYN}$OUT_B64${RST}  ← abra e copie para o Codemagic"
echo ""
echo -e "  ${BOLD}Próximos passos:${RST}"
echo -e "  1. Abra ${CYN}$OUT_B64${RST} e copie cada valor"
echo -e "  2. Cole em ${BLU}Codemagic → App Settings → Environment variables${RST}"
echo -e "  3. Dispare o build Android — o APK será assinado automaticamente"
echo ""
echo -e "  ${YEL}⚠️  Faça backup do arquivo .jks — sem ele não há como publicar atualizações!${RST}"
echo ""

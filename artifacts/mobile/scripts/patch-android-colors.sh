#!/usr/bin/env bash
# ============================================================
# ADICIONE ESTE SCRIPT NO CODEMAGIC como um passo de Script
# ENTRE "Expo Prebuild" e "Build AAB"
#
# Nome do passo: "Corrigir cor do ícone Android"
# Comando: bash artifacts/mobile/scripts/patch-android-colors.sh
# ============================================================

set -e

# Detecta o root do projeto (onde o script é chamado)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ANDROID_ROOT="$PROJECT_ROOT/android"

echo "==> [patch-android-colors] Iniciando patch..."
echo "    Project root: $PROJECT_ROOT"
echo "    Android root: $ANDROID_ROOT"

RES="$ANDROID_ROOT/app/src/main/res"
VALUES="$RES/values"
DRAWABLE="$RES/drawable"
MIPMAP="$RES/mipmap-anydpi-v26"

# ── 1. Cria arquivo de cor separado ─────────────────────────
mkdir -p "$VALUES"
cat > "$VALUES/netplay_icon_colors.xml" << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="iconBackground">#000000</color>
</resources>
XMLEOF
echo "    ✓ netplay_icon_colors.xml criado"

# ── 2. Patcha colors.xml se necessário ──────────────────────
if [ -f "$VALUES/colors.xml" ]; then
  if ! grep -q 'name="iconBackground"' "$VALUES/colors.xml"; then
    sed -i.bak 's|</resources>|    <color name="iconBackground">#000000</color>\n</resources>|' "$VALUES/colors.xml"
    echo "    ✓ colors.xml patchado"
  fi
fi

# ── 3. Cria drawable de fundo ────────────────────────────────
mkdir -p "$DRAWABLE"
cat > "$DRAWABLE/ic_launcher_background.xml" << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#000000"/>
</shape>
XMLEOF
echo "    ✓ ic_launcher_background drawable criado"

# ── 4. Substitui @color/iconBackground → @drawable ──────────
if [ -d "$MIPMAP" ]; then
  for f in "$MIPMAP/ic_launcher.xml" "$MIPMAP/ic_launcher_round.xml"; do
    if [ -f "$f" ] && grep -q '@color/iconBackground' "$f"; then
      sed -i.bak 's|@color/iconBackground|@drawable/ic_launcher_background|g' "$f"
      echo "    ✓ $(basename $f) patchado"
    fi
  done
fi

echo "==> [patch-android-colors] Concluído com sucesso!"

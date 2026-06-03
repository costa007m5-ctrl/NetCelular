#!/usr/bin/env bash
# ============================================================
# ADICIONE ESTE SCRIPT NO CODEMAGIC como um passo de Script
# ENTRE "Expo Prebuild" e "Build AAB"
#
# Nome do passo: "Patch Android (cor do ícone + BuildConfig)"
# Comando: bash artifacts/mobile/scripts/patch-android-colors.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ANDROID_ROOT="$PROJECT_ROOT/android"

echo "==> [patch-android] Iniciando patch..."
echo "    Project root: $PROJECT_ROOT"
echo "    Android root: $ANDROID_ROOT"

RES="$ANDROID_ROOT/app/src/main/res"
VALUES="$RES/values"
DRAWABLE="$RES/drawable"
MIPMAP="$RES/mipmap-anydpi-v26"
BUILD_GRADLE="$ANDROID_ROOT/app/build.gradle"

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

# ── 4. Patcha ic_launcher*.xml ─────────────────────────────
if [ -d "$MIPMAP" ]; then
  for f in "$MIPMAP/ic_launcher.xml" "$MIPMAP/ic_launcher_round.xml"; do
    if [ -f "$f" ] && grep -q '@color/iconBackground' "$f"; then
      sed -i.bak 's|@color/iconBackground|@drawable/ic_launcher_background|g' "$f"
      echo "    ✓ $(basename $f) patchado"
    fi
  done
fi

# ── 5. Garante buildConfig=true no app/build.gradle ─────────
if [ -f "$BUILD_GRADLE" ]; then
  if ! grep -q "buildConfig true" "$BUILD_GRADLE" && ! grep -q "buildConfig = true" "$BUILD_GRADLE"; then
    # Insere buildFeatures { buildConfig true } logo após "android {"
    sed -i.bak 's|android {|android {\n    buildFeatures {\n        buildConfig true\n    }|' "$BUILD_GRADLE"
    echo "    ✓ buildConfig habilitado em app/build.gradle"
  else
    echo "    ✓ buildConfig já está habilitado"
  fi
fi

echo "==> [patch-android] Concluído com sucesso!"

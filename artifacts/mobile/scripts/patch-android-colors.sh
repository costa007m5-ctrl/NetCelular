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
    python3 -c "
path = '$VALUES/colors.xml'
with open(path, 'r') as f:
    c = f.read()
c = c.replace('</resources>', '    <color name=\"iconBackground\">#000000</color>\n</resources>')
with open(path, 'w') as f:
    f.write(c)
"
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
      python3 -c "
path = '$f'
with open(path, 'r') as file:
    c = file.read()
c = c.replace('@color/iconBackground', '@drawable/ic_launcher_background')
with open(path, 'w') as file:
    file.write(c)
"
      echo "    ✓ $(basename $f) patchado"
    fi
  done
fi

# ── 5. Garante buildConfig=true no app/build.gradle ─────────
if [ -f "$BUILD_GRADLE" ]; then
  python3 -c "
import re, sys

path = '$BUILD_GRADLE'

with open(path, 'r') as f:
    contents = f.read()

if 'buildConfig true' in contents or 'buildConfig = true' in contents:
    print('    ✓ buildConfig ja esta habilitado')
    sys.exit(0)

if 'buildFeatures' in contents:
    contents = re.sub(
        r'(buildFeatures\s*\{)([^}]*?)(\})',
        lambda m: m.group(1) + m.group(2) + '        buildConfig true\n    ' + m.group(3),
        contents,
        flags=re.DOTALL
    )
    print('    ✓ buildConfig adicionado dentro do buildFeatures existente')
else:
    contents = contents.replace(
        'android {',
        'android {\n    buildFeatures {\n        buildConfig true\n    }',
        1
    )
    print('    ✓ buildFeatures { buildConfig true } injetado')

with open(path, 'w') as f:
    f.write(contents)
"
else
  echo "    ⚠ build.gradle nao encontrado em: $BUILD_GRADLE"
fi

echo "==> [patch-android] Concluido com sucesso!"

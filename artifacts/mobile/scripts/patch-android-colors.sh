#!/usr/bin/env bash
# Run this script AFTER expo prebuild and BEFORE ./gradlew build
# It guarantees @color/iconBackground exists for adaptive icon XML files.
# Add as a Codemagic step between "Expo Prebuild" and "Build AAB".

set -e

ANDROID_RES="artifacts/mobile/android/app/src/main/res"
VALUES_DIR="$ANDROID_RES/values"
DRAWABLE_DIR="$ANDROID_RES/drawable"
MIPMAP_DIR="$ANDROID_RES/mipmap-anydpi-v26"

echo "==> Patching Android icon background resources..."

# 1. Create dedicated color resource file
mkdir -p "$VALUES_DIR"
cat > "$VALUES_DIR/netplay_icon_colors.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="iconBackground">#000000</color>
</resources>
EOF
echo "    ✓ netplay_icon_colors.xml created"

# 2. Patch colors.xml if it exists and is missing iconBackground
if [ -f "$VALUES_DIR/colors.xml" ]; then
  if ! grep -q 'name="iconBackground"' "$VALUES_DIR/colors.xml"; then
    sed -i 's|</resources>|    <color name="iconBackground">#000000</color>\n</resources>|' "$VALUES_DIR/colors.xml"
    echo "    ✓ colors.xml patched"
  else
    echo "    ✓ colors.xml already has iconBackground"
  fi
fi

# 3. Create drawable background (alternative to @color reference)
mkdir -p "$DRAWABLE_DIR"
cat > "$DRAWABLE_DIR/ic_launcher_background.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#000000"/>
</shape>
EOF
echo "    ✓ ic_launcher_background drawable created"

# 4. Patch ic_launcher*.xml to replace @color/iconBackground → @drawable/ic_launcher_background
if [ -d "$MIPMAP_DIR" ]; then
  for f in "$MIPMAP_DIR/ic_launcher.xml" "$MIPMAP_DIR/ic_launcher_round.xml"; do
    if [ -f "$f" ] && grep -q '@color/iconBackground' "$f"; then
      sed -i 's|@color/iconBackground|@drawable/ic_launcher_background|g' "$f"
      echo "    ✓ Patched $(basename $f)"
    fi
  done
fi

echo "==> Done. Android icon resources patched successfully."

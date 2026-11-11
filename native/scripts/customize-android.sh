#!/usr/bin/env bash
# Run after "npx cap add android": version, icons, splash, orientation and signing.
set -euo pipefail
# Image tools: install ImageMagick if the runner does not have it
if ! command -v magick >/dev/null 2>&1 && ! command -v convert >/dev/null 2>&1; then
  sudo apt-get update -qq && sudo apt-get install -y -qq imagemagick
fi
if command -v magick >/dev/null 2>&1; then IM="magick"; ID="magick identify"; else IM="convert"; ID="identify"; fi

VER="${1:-1.0.0}"; VER="${VER#v}"; BUILD="${2:-1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AND="$ROOT/native/android"; RES="$AND/app/src/main/res"; ICON="$ROOT/app/icon-512.png"; ICON_FG="$ROOT/app/icon-512-maskable.png"; LOGO="$ROOT/assets/logo.png"
GRADLE="$AND/app/build.gradle"; MAN="$AND/app/src/main/AndroidManifest.xml"

for f in "$ICON" "$ICON_FG" "$LOGO"; do [ -f "$f" ] || { echo "ERROR: missing file $f"; exit 1; }; done

# Version
sed -i "s/versionCode 1/versionCode $BUILD/; s/versionName \"1.0\"/versionName \"$VER\"/" "$GRADLE"

# Portrait only, keyboard resizes the screen
grep -q 'screenOrientation' "$MAN" || sed -i 's#android:name=".MainActivity"#android:name=".MainActivity" android:screenOrientation="portrait"#' "$MAN"
grep -q 'windowSoftInputMode' "$MAN" || sed -i 's#android:name=".MainActivity"#android:name=".MainActivity" android:windowSoftInputMode="adjustResize"#' "$MAN"

# Launcher icons (square, round and adaptive foreground)
declare -A SZ=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
declare -A FG=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  s=${SZ[$d]}; f=${FG[$d]}; inner=$(( f * 62 / 100 ))
  mkdir -p "$RES/mipmap-$d"
  $IM "$ICON" -resize ${s}x${s} "$RES/mipmap-$d/ic_launcher.png"
  $IM "$ICON" -resize ${s}x${s} "$RES/mipmap-$d/ic_launcher_round.png"
  $IM "$ICON_FG" -resize ${inner}x${inner} -background none -gravity center -extent ${f}x${f} "$RES/mipmap-$d/ic_launcher_foreground.png"
done

# Splash screen: logo centered on white
find "$RES" -name 'splash.png' | while read -r file; do
  dim=$($ID -format '%wx%h' "$file"); w=${dim%x*}; h=${dim#*x}
  m=$(( (w < h ? w : h) * 45 / 100 ))
  $IM -size ${w}x${h} xc:white \( "$LOGO" -resize ${m}x${m} \) -gravity center -composite "$file"
done

# Release signing (only when the key is provided through environment variables)
cat >> "$GRADLE" <<'GRADLE'

def ksPath = System.getenv('KS_PATH')
if (ksPath) {
    android {
        signingConfigs {
            release {
                storeFile file(ksPath)
                storePassword System.getenv('KS_PASSWORD')
                keyAlias System.getenv('KS_ALIAS')
                keyPassword System.getenv('KS_PASSWORD')
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.release
            }
        }
    }
}
GRADLE
echo "Android project customized (version $VER, build $BUILD)."

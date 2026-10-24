#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(pwd)"
VENDOR="$APP_ROOT/vendor/espeak"
DEBS="$APP_ROOT/vendor/debs"
WRAPPER="$VENDOR/bin/espeak-ng-local"

rm -rf "$VENDOR" "$DEBS"
mkdir -p "$VENDOR" "$DEBS" "$VENDOR/bin"

cd "$DEBS"

echo "[espeak] downloading Debian runtime packages..."
apt-get download espeak-ng libespeak-ng1 espeak-ng-data libpcaudio0 libsonic0

for deb in ./*.deb; do
  echo "[espeak] extracting $(basename "$deb")"
  dpkg-deb -x "$deb" "$VENDOR"
done

ESPEAK_BIN="$VENDOR/usr/bin/espeak-ng"
LIBDIR="$VENDOR/usr/lib/x86_64-linux-gnu"
DATA_PARENT="$LIBDIR"

if [ ! -x "$ESPEAK_BIN" ]; then
  echo "[espeak] ERROR: executable not found at $ESPEAK_BIN" >&2
  exit 1
fi
if [ ! -d "$DATA_PARENT/espeak-ng-data" ]; then
  echo "[espeak] ERROR: espeak-ng-data not found under $DATA_PARENT" >&2
  find "$VENDOR/usr" -maxdepth 5 -type d -name 'espeak-ng-data' -print >&2 || true
  exit 1
fi

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
export LD_LIBRARY_PATH="$LIBDIR:\${LD_LIBRARY_PATH:-}"
exec "$ESPEAK_BIN" --path="$DATA_PARENT" "\$@"
EOF
chmod +x "$WRAPPER"

"$WRAPPER" --version
"$WRAPPER" -v tr --ipa -q 'Furkan' >/dev/null

echo "LOCAL ESPEAK READY $WRAPPER"

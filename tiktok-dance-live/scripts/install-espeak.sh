#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(pwd)"
VENDOR="$APP_ROOT/vendor/espeak"
DEBS="$APP_ROOT/vendor/debs"
WRAPPER="$VENDOR/bin/espeak-ng-local"
BASE="https://deb.debian.org/debian/pool/main"

rm -rf "$VENDOR" "$DEBS"
mkdir -p "$VENDOR" "$DEBS" "$VENDOR/bin"
cd "$DEBS"

fetch(){
  local url="$1" out="$2"
  echo "[espeak] downloading $out"
  curl -fsSL --retry 4 --retry-delay 2 "$url" -o "$out"
}

fetch "$BASE/e/espeak-ng/espeak-ng_1.51+dfsg-10+deb12u2_amd64.deb" "espeak-ng.deb"
fetch "$BASE/e/espeak-ng/libespeak-ng1_1.51+dfsg-10+deb12u2_amd64.deb" "libespeak-ng1.deb"
fetch "$BASE/e/espeak-ng/espeak-ng-data_1.51+dfsg-10+deb12u2_amd64.deb" "espeak-ng-data.deb"
fetch "$BASE/p/pcaudiolib/libpcaudio0_1.2-2_amd64.deb" "libpcaudio0.deb"
fetch "$BASE/s/sonic/libsonic0_0.2.0-12_amd64.deb" "libsonic0.deb"

for deb in ./*.deb; do
  echo "[espeak] extracting $(basename "$deb")"
  dpkg-deb -x "$deb" "$VENDOR"
done

ESPEAK_BIN="$VENDOR/usr/bin/espeak-ng"
LIBDIR="$VENDOR/usr/lib/x86_64-linux-gnu"
DATADIR="$LIBDIR/espeak-ng-data"
DATA_PARENT="$LIBDIR"

if [ ! -x "$ESPEAK_BIN" ]; then
  echo "[espeak] ERROR: executable not found at $ESPEAK_BIN" >&2
  exit 1
fi
if [ ! -f "$DATADIR/phontab" ]; then
  echo "[espeak] ERROR: phontab not found at $DATADIR/phontab" >&2
  find "$VENDOR/usr" -maxdepth 7 -type f -name phontab -print >&2 || true
  exit 1
fi

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
export LD_LIBRARY_PATH="$LIBDIR:\${LD_LIBRARY_PATH:-}"
export ESPEAK_DATA_PATH="$DATADIR"
exec "$ESPEAK_BIN" --path="$DATA_PARENT" "\$@"
EOF
chmod +x "$WRAPPER"

IPA="$("$WRAPPER" -v tr --ipa -q 'Furkan' 2>"$DEBS/espeak-test.err" || true)"
if [ -z "$(printf '%s' "$IPA" | tr -d '[:space:]')" ]; then
  echo "[espeak] ERROR: Furkan phoneme test returned empty output" >&2
  cat "$DEBS/espeak-test.err" >&2 || true
  exit 1
fi

echo "LOCAL ESPEAK PHONEME Furkan=$IPA"
echo "LOCAL ESPEAK READY $WRAPPER"

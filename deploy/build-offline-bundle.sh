#!/usr/bin/env bash
#
# Build a self-contained, offline "unzip and run" bundle of Edara.
#
# It compiles the client and server, installs production-only server dependencies
# (all pure JS/WASM — no native modules, no .bin symlinks), bundles a Node runtime
# for the target OS/arch, and zips everything so the target needs NO internet, NO
# Node install and NO `npm install`: just unzip and run start.bat / ./start.sh.
#
# Run this on a build machine WITH internet (Linux/WSL/macOS). The OUTPUT runs offline.
#
# Usage:
#   deploy/build-offline-bundle.sh [--target win-x64] [--node v24.5.0] [--with-db] [--out PATH]
#
# Options:
#   --target   win-x64 (default) | win-arm64 | linux-x64 | linux-arm64
#   --node     Node version to bundle (default: the version running this script)
#   --with-db  Include the current server/data/edara.db (default: ship a fresh DB;
#              the server seeds an admin account on first boot)
#   --out      Output zip path (default: deploy/dist/edara-offline-<target>.zip)
#
# Requirements on the build machine: bash, node, npm, curl, zip, and unzip (for
# Windows targets) or tar (for Linux targets).

set -euo pipefail

# --- resolve paths ---------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES="$SCRIPT_DIR/templates"
CACHE="${CACHE:-$SCRIPT_DIR/.cache}"          # cached Node runtimes (git-ignored)

# --- defaults (overridable via flags/env) ----------------------------------
TARGET="${TARGET:-win-x64}"
NODE_VERSION="${NODE_VERSION:-$(node -v)}"     # e.g. v24.5.0 — matches the build host by default
INCLUDE_DB="${INCLUDE_DB:-0}"
OUT="${OUT:-}"

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2;;
    --node)   NODE_VERSION="$2"; shift 2;;
    --with-db) INCLUDE_DB=1; shift;;
    --out)    OUT="$2"; shift 2;;
    -h|--help) usage 0;;
    *) echo "Unknown argument: $1" >&2; usage 1;;
  esac
done

# --- validate target / prerequisites ---------------------------------------
case "$TARGET" in
  win-x64|win-arm64)     OSFAM=win;   NODE_ARCHIVE="node-$NODE_VERSION-$TARGET.zip";;
  linux-x64|linux-arm64) OSFAM=linux; NODE_ARCHIVE="node-$NODE_VERSION-$TARGET.tar.xz";;
  *) echo "Unsupported --target '$TARGET' (use win-x64|win-arm64|linux-x64|linux-arm64)" >&2; exit 1;;
esac

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1" >&2; exit 1; }; }
need node; need npm; need curl; need zip
[ "$OSFAM" = win ] && need unzip || need tar

OUT="${OUT:-$SCRIPT_DIR/dist/edara-offline-$TARGET.zip}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/stage"
B="$WORK/edara"                                # the bundle root (extracts as ./edara)

echo "==> Building Edara offline bundle"
echo "    target      : $TARGET"
echo "    node        : $NODE_VERSION"
echo "    include DB  : $INCLUDE_DB"
echo "    output      : $OUT"

# --- 0) ensure dev dependencies are present (needed to build) ---------------
if [ ! -d "$ROOT/node_modules" ] || [ ! -d "$ROOT/client/node_modules" ] || [ ! -d "$ROOT/server/node_modules" ]; then
  echo "==> Installing workspace dependencies (npm install)"
  ( cd "$ROOT" && npm install )
fi

# --- 1) build client + server ----------------------------------------------
echo "==> Building client and server"
( cd "$ROOT" && npm run build )
[ -f "$ROOT/server/dist/index.js" ]   || { echo "server build missing dist/index.js" >&2; exit 1; }
[ -f "$ROOT/client/dist/index.html" ] || { echo "client build missing dist/index.html" >&2; exit 1; }

# --- 2) production-only server node_modules (portable, no symlinks) ---------
echo "==> Installing production-only server dependencies"
mkdir -p "$STAGE/server"
cp "$ROOT/server/package.json" "$ROOT/server/package-lock.json" "$STAGE/server/"
( cd "$STAGE/server" && npm ci --omit=dev --no-audit --no-fund )
# Remove Unix symlinks (Windows can't extract them) and unused .bin launchers.
find "$STAGE/server/node_modules" -type l -delete
find "$STAGE/server/node_modules" -name .bin -type d -exec rm -rf {} + 2>/dev/null || true

# --- 3) fetch + cache the Node runtime for the target ----------------------
NODE_CACHE="$CACHE/$NODE_VERSION/$TARGET"
if [ ! -e "$NODE_CACHE/.ok" ]; then
  echo "==> Downloading Node $NODE_VERSION for $TARGET"
  mkdir -p "$NODE_CACHE"
  curl -fsSL -o "$WORK/$NODE_ARCHIVE" "https://nodejs.org/dist/$NODE_VERSION/$NODE_ARCHIVE"
  if [ "$OSFAM" = win ]; then
    unzip -q "$WORK/$NODE_ARCHIVE" -d "$WORK/nodeunpack"
    cp "$WORK/nodeunpack/node-$NODE_VERSION-$TARGET/node.exe" "$NODE_CACHE/node.exe"
  else
    mkdir -p "$WORK/nodeunpack"
    tar -xf "$WORK/$NODE_ARCHIVE" -C "$WORK/nodeunpack"
    cp "$WORK/nodeunpack/node-$NODE_VERSION-$TARGET/bin/node" "$NODE_CACHE/node"
  fi
  touch "$NODE_CACHE/.ok"
else
  echo "==> Using cached Node $NODE_VERSION for $TARGET"
fi

# --- 4) assemble the bundle ------------------------------------------------
echo "==> Assembling bundle"
mkdir -p "$B/node" "$B/server/src/db" "$B/server/public"
cp -r "$ROOT/server/dist"                 "$B/server/dist"
cp -r "$STAGE/server/node_modules"        "$B/server/node_modules"
cp "$ROOT/server/src/db/schema.sql"       "$B/server/src/db/schema.sql"
cp -r "$ROOT/client/dist/."               "$B/server/public/"
cp "$TEMPLATES/server.package.json"       "$B/server/package.json"
cp "$TEMPLATES/README-تشغيل.txt"          "$B/README-تشغيل.txt"

# Node runtime + platform launcher
if [ "$OSFAM" = win ]; then
  cp "$NODE_CACHE/node.exe" "$B/node/node.exe"
  # Normalize to LF then to CRLF so the .bat is always clean CRLF regardless of template endings.
  sed 's/\r$//; s/$/\r/' "$TEMPLATES/start.bat" > "$B/start.bat"
else
  cp "$NODE_CACHE/node" "$B/node/node"; chmod +x "$B/node/node"
  # Force LF so the shell launcher runs on the Linux target.
  sed 's/\r$//' "$TEMPLATES/start.sh" > "$B/start.sh"; chmod +x "$B/start.sh"
fi

# Optional: ship the current database (default is a fresh DB seeded on first boot)
if [ "$INCLUDE_DB" = 1 ] && [ -f "$ROOT/server/data/edara.db" ]; then
  echo "==> Including current database"
  mkdir -p "$B/server/data"
  cp "$ROOT/server/data/edara.db" "$B/server/data/edara.db"
fi

# .env with a fresh random JWT secret (override by exporting JWT_SECRET before running)
SECRET="${JWT_SECRET:-$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')}"
printf 'JWT_SECRET=%s\nPORT=3000\nHOST=0.0.0.0\n' "$SECRET" > "$B/server/.env"

# --- 5) zip + verify -------------------------------------------------------
echo "==> Zipping"
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
( cd "$WORK" && zip -r -q "$OUT" edara )
unzip -t "$OUT" >/dev/null && echo "    integrity: OK"
SYMLINKS="$(unzip -Z "$OUT" | awk '{print $1}' | grep -c '^l' || true)"
echo "    symlink entries: $SYMLINKS (expected 0)"

echo "==> Done: $OUT ($(du -h "$OUT" | cut -f1))"
echo "    Unzip on the target, then run: $([ "$OSFAM" = win ] && echo 'start.bat' || echo './start.sh')"

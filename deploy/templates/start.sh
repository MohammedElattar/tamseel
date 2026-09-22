#!/usr/bin/env bash
# Launcher for the self-contained Linux bundle. Runs the bundled Node against the
# compiled server, with the working directory set to server/ so the relative data/
# and src/db/schema.sql paths resolve.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/server"
echo "================================================"
echo "   Edara - Officer Evaluation Committee System"
echo "================================================"
echo "  On this computer:  http://localhost:3000"
echo "  From the network:  http://THIS-PC-IP:3000"
echo "  Press Ctrl+C to stop."
echo
exec "$DIR/node/node" dist/index.js

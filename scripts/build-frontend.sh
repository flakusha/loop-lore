#!/usr/bin/env bash
set -euo pipefail

# Build frontend assets: JS bundles → icons → compress + copy
#
# Usage: ./scripts/build-frontend.sh

DIST="./dist/public"
SRC_PUBLIC="./src/public"
SRC_VIEWS="./src/views"

echo "=== Building JS bundles ==="
bun build \
    --target browser --minify \
    --outdir "$DIST" \
    --banner "(()=>{" --footer "})()" \
    ./src/frontend/app.ts \
    ./src/frontend/pages.ts \
    ./src/frontend/chat-vendor.ts

bun build \
    --target browser --minify \
    --outdir "$DIST" \
    ./src/frontend/vendor.ts

echo "=== Copying Tabler Icons ==="
bun run src/build/copy-icons.ts

echo "=== Compressing and copying assets ==="
bun run src/build/compress.ts "$DIST" "$SRC_PUBLIC" "$SRC_VIEWS"

echo "=== Frontend build complete ==="

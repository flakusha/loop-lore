#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend build: JS bundles → icons → compress + copy
 *
 * Usage:
 *   bun run scripts/build-frontend.mjs
 */

import { $, } from "bun";
import path from "node:path";

const REPO_ROOT = import.meta.dir + "/..";
const DIST = path.join(REPO_ROOT, "dist/public",);
const SRC_PUBLIC = path.join(REPO_ROOT, "src/public",);
const SRC_VIEWS = path.join(REPO_ROOT, "src/views",);

// ── Build JS bundles ────────────────────────────────────────────

async function buildBundles() {
  console.log("=== Building JS bundles ===",);

  const frontend = path.join(REPO_ROOT, "src/frontend",);

  // Main app bundle
  await $`bun build --target browser --minify --outdir ${DIST} --banner "(()=>{" --footer "})()" ${frontend}/app.ts ${frontend}/pages.ts ${frontend}/chat-vendor.ts ${frontend}/chat-list.ts`;

  // Locale init
  await $`bun build --target browser --minify --outdir ${DIST} ${frontend}/locale-init.ts`;

  // Vendor bundle
  await $`bun build --target browser --minify --outdir ${DIST} ${frontend}/vendor.ts`;

  console.log("✓ JS bundles built",);
}

// ── Copy icons ──────────────────────────────────────────────────

async function copyIcons() {
  console.log("=== Copying Tabler Icons ===",);
  await $`bun run src/build/copy-icons.ts`;
  console.log("✓ Icons copied",);
}

// ── Compress and copy assets ────────────────────────────────────

async function compressAssets() {
  console.log("=== Compressing and copying assets ===",);
  await $`bun run src/build/compress.ts ${DIST} ${SRC_PUBLIC} ${SRC_VIEWS}`;
  console.log("✓ Assets compressed and copied",);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  await buildBundles();
  await copyIcons();
  await compressAssets();
  console.log("=== Frontend build complete ===",);
}

main().catch((error,) => {
  console.error("❌ Build failed:", error.message,);
  process.exit(1,);
},);

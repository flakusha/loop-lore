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

  // Single Alpine init bundle (replaces vendor.js + app.js to avoid multi-bundle
  // Alpine module-copy problem — stores, components, plugins all in one scope).
  await $`bun build --target browser --minify --outdir ${DIST} --banner "(()=>{" --footer "})()" ${frontend}/alpine-init.ts`;

  // Page-specific behaviors (accesses globalThis only, no Alpine imports)
  // IIFE wrapper isolates Bun's __toESM WeakMap `var o` interop cache from
  // module-level declarations (e.g. safe-buffer's `function o`), which hoist
  // above `var` and made `o??=new WeakMap` skip init → `o.get is not a function`.
  await $`bun build --target browser --minify --outdir ${DIST} --banner "(()=>{" --footer "})()" ${frontend}/pages.ts`;

  // Chat vendor libs (marked + DOMPurify on globalThis)
  await $`bun build --target browser --minify --outdir ${DIST} ${frontend}/chat-vendor.ts`;

  // Chat list page
  await $`bun build --target browser --minify --outdir ${DIST} ${frontend}/chat-list.ts`;

  // Locale init (separate — loads before Alpine for SSR translations)
  await $`bun build --target browser --minify --outdir ${DIST} ${frontend}/locale-init.ts`;

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

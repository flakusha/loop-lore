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
  await $`bun build --target browser --minify --outdir ${DIST} --entry-naming "[name]-[hash].[ext]" --banner "(()=>{" --footer "})()" ${frontend}/alpine-init.ts`;

  // Page-specific behaviors (accesses globalThis only, no Alpine imports)
  // IIFE wrapper isolates Bun's __toESM WeakMap `var o` interop cache from
  // module-level declarations (e.g. safe-buffer's `function o`), which hoist
  // above `var` and made `o??=new WeakMap` skip init → `o.get is not a function`.
  await $`bun build --target browser --minify --outdir ${DIST} --entry-naming "[name]-[hash].[ext]" --banner "(()=>{" --footer "})()" ${frontend}/pages.ts`;

  // Chat vendor libs (marked + DOMPurify on globalThis). IIFE wrapper — as a
  // classic script, top-level `var`/`function` (minifier helper aliases like
  // `var t = Object.defineProperty`) become globalThis properties and clobber
  // page globals (globalThis.t translator) → Alpine `t(...)` crashes.
  await $`bun build --target browser --minify --outdir ${DIST} --entry-naming "[name]-[hash].[ext]" --banner "(()=>{" --footer "})()" ${frontend}/chat-vendor.ts`;

  // Chat list page. IIFE wrapper — same classic-script global-var clobber as
  // chat-vendor above: its minified `var t = Object.defineProperty` replaced
  // globalThis.t (the i18n translator), breaking every `t(...)` binding on the
  // page (BUG-chat-list-global-t-clobbered-by-bundle-var).
  await $`bun build --target browser --minify --outdir ${DIST} --entry-naming "[name]-[hash].[ext]" --banner "(()=>{" --footer "})()" ${frontend}/chat-list.ts`;

  // Locale init (separate — loads before Alpine for SSR translations)
  await $`bun build --target browser --minify --outdir ${DIST} --entry-naming "[name]-[hash].[ext]" --banner "(()=>{" --footer "})()" ${frontend}/locale-init.ts`;

  // htmx ↔ egui handoff bridge (window.loopLoreEgui + the chat header entry
  // button). IIFE wrapper — same classic-script global-var hazard as the other
  // non-worker entries; the module only touches globalThis via `window`.
  // Deliberately UNHASHED: the second consumer is the /egui host page, which
  // is rendered per-request by its route and therefore never passes through
  // hash injection (only files under dist/public do). One stable URL for both
  // consumers; the non-hashed Cache-Control (60s) is the cost.
  // `--format=iife` (no banner/footer): the entry has real `export`s for the
  // unit test, and bun appends `export{…}` AFTER any banner/footer — as an
  // ESM statement it is a syntax error when the file loads as a classic
  // script. iife keeps the whole module (and its dropped exports) inside
  // bun's own wrapper. Consumers use `window.loopLoreEgui`, not the exports.
  await $`bun build --target browser --minify --format=iife --outdir ${DIST} ${frontend}/egui-bridge.ts`;

  // WASM module loader (pre-compiled hot binary — fetches + exposes C ABI)
  await $`bun build --target browser --minify --outdir ${DIST} --banner "(()=>{" --footer "})()" ${frontend}/wasm-loader.ts`;

  // xterm PTY panel chunk (epic-browser-editor-support, approach B). ESM
  // because terminal-panel.ts consumes it via runtime dynamic
  // import("/terminal-xterm.js") — bun builds the main bundle as one
  // non-split IIFE, so a runtime URL import is the only way to keep the
  // ~300KB terminal stack off the every-page bundle. Deliberately UNHASHED
  // (same rationale as egui-bridge: consumed outside hash injection).
  await $`bun build --target browser --minify --format=esm --outdir ${DIST} ${frontend}/terminal-xterm.ts`;

  // Local inference workers (standalone — no IIFE wrapper: workers run in
  // their own scope. Each lazy-loads its SDK from CDN on first use;
  // never part of the main-thread bundle.)
  await $`bun build --target browser --minify --outdir ${DIST} ${frontend}/alpine/local-engine.worker.ts`;
  await $`bun build --target browser --minify --outdir ${DIST} ${frontend}/alpine/wllama-engine.worker.ts`;

  console.log("JS bundles built",);
}

// ── Copy icons ──────────────────────────────────────────────────

async function copyIcons() {
  console.log("=== Copying Tabler Icons ===",);
  await $`bun run src/build/copy-icons.ts`;
  console.log("Icons copied",);
}

// ── Compress and copy assets ────────────────────────────────────

async function compressAssets() {
  console.log("=== Compressing and copying assets ===",);
  await $`bun run src/build/compress.ts --dist ${DIST} --public ${SRC_PUBLIC} --views ${SRC_VIEWS}`;
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  await buildBundles();
  await copyIcons();
  await compressAssets();
  console.log("=== Frontend build complete ===",);
}

main().catch((error,) => {
  console.error("Build failed:", error.message,);
  process.exit(1,);
},);

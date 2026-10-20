// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Report whether the egui WASM bundle made it into a release artifact.
 *
 * The release runners provision a Rust toolchain and the wasm-bindgen CLI
 * (pinned to the workspace Cargo.lock), so the bundle is normally BUILT. It
 * is still optional: a missing toolchain, a failed CLI provisioning, or a
 * crate that does not compile makes `bun run build` skip the stage, and dist
 * then ships without dist/public/egui. The checksum manifest
 * (`SHA256SUMS.txt`) covers a dist that is silently missing a browser bundle,
 * which reads as intentional — so name it.
 *
 * The witness file is `app_bg.wasm`: that is what wasm-bindgen emits with
 * `--target web`, what the /egui page loads, and what the freshness stamp
 * hashes (src/build/egui-artifact.ts).
 *
 * Never fail. Exit is always 0.
 *
 * Usage: bun run scripts/check/egui-release-warn.mjs [dist-subdir]
 * Prints `egui_present=true|false` on the last line for step-output use.
 */
import { existsSync, } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..",);
const distDir = path.resolve(projectRoot, process.argv[2] ?? "dist",);
const bundle = path.join(distDir, "public", "egui", "app_bg.wasm",);
const present = existsSync(bundle,);

if (present) {
  console.log(`egui WASM bundle present: ${path.relative(projectRoot, bundle,)}`,);
} else {
  const rel = path.relative(projectRoot, path.join(distDir, "public", "egui",),);
  const msg = `egui WASM bundle OMITTED from this release: ${rel} does not exist. ` +
    `build:egui skipped — no Rust toolchain or no wasm-bindgen CLI on the ` +
    `runner, or the crate did not compile — so dist ships without the egui ` +
    `browser frontend and the checksum manifest covers it as-is. See the run ` +
    `log for the reason (scripts/build-egui-wasm.ts).`;
  console.warn(`WARNING: ${msg}`,);
  console.log(`::warning::${msg}`,);
}

console.log(`egui_present=${present}`,);

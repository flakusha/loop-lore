// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * wasm32 type-check for the egui crate - the ONLY check that compiles the
 * actual UI code.
 *
 * `native/loop-lore-egui/src/lib.rs` gates the UI modules behind the wasm
 * target:
 *
 *     #[cfg(target_arch = "wasm32")]
 *     mod app;
 *     #[cfg(target_arch = "wasm32")]
 *     mod web;
 *
 * so NOTHING on the host target compiles app.rs or web.rs - not cargo test,
 * not clippy, not the gates suite. A host-target check is structurally
 * impossible for app.rs: its wasm-gated siblings (stream::open_stream,
 * gallery::upload_asset, ...) do not exist on the host. The only target that
 * type-checks the UI code is wasm32-unknown-unknown.
 *
 * The check needs the wasm32 TARGET but NOT the wasm-bindgen CLI, so it works
 * where the browser bundle cannot be built.
 *
 * Contract:
 * - the crate does not compile -> FAILED, exit 1. A broken UI must not ship
 *   green; this check is what makes the pipeline honest about it.
 * - no toolchain / no wasm32 std -> SKIPPED with the reason, exit 0. A missing
 *   Rust toolchain is a SUPPORTED state and must never redden a build.
 *
 * Run via: bun run scripts/native/check-wasm.ts
 */

import { spawnSync, } from "node:child_process";
import { REPO_ROOT, WASM_TARGET, } from "./shared";
import { ensureWasmToolchain, type WasmToolchain, } from "./toolchain";

/** The crate whose UI modules only exist on the wasm target. */
const CRATE = "loop-lore-egui";

/** The signature of "this target has no std": cargo's E0463 plus the toolchain's own wording. */
const TARGET_MISSING = /E0463|can't find crate for `core`|target may not be installed/;

/**
 * Report a check that could not be evaluated: SKIPPED with the reason, never
 * a silent pass and never a red build.
 * @param reason - why the check could not run
 */
function skip(reason: string,): void {
  const message = `[check:wasm] SKIPPED: ${reason}`;
  console.warn(message,);
  if (process.env.GITHUB_ACTIONS) { console.warn(`::warning::${message}`,); }
}

/**
 * Run the wasm32 type-check.
 * @param env - environment additions for cargo
 * @returns the exit status and the combined cargo output
 */
function runCheck(env: Record<string, string>,): { status: number | null; output: string } {
  const result = spawnSync(
    "cargo",
    ["check", "--locked", "--target", WASM_TARGET, "-p", CRATE,],
    { encoding: "utf8", cwd: REPO_ROOT, env: { ...process.env, ...env, }, },
  );

  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}`, };
}

/**
 * Ask rustup for the wasm32 std of the ACTIVE toolchain - the one the repo's
 * rust-toolchain.toml pins, and therefore the one cargo resolves here.
 * @returns `true` when the target was added
 */
function addTargetToActiveToolchain(): boolean {
  if (spawnSync("rustup", ["--version",], { stdio: "ignore", cwd: REPO_ROOT, },).status !== 0) {
    return false;
  }

  const added = spawnSync("rustup", ["target", "add", WASM_TARGET,], { cwd: REPO_ROOT, stdio: "inherit", },);
  return added.status === 0;
}

function main(): void {
  console.log(`=== check:wasm (${CRATE}, ${WASM_TARGET}) ===`,);

  if (spawnSync("cargo", ["--version",], { stdio: "ignore", cwd: REPO_ROOT, },).status !== 0) {
    skip("cargo not found - install a Rust toolchain (https://rustup.rs)",);
    return;
  }

  let toolchain: WasmToolchain;
  try {
    toolchain = ensureWasmToolchain({ log: (line,) => console.log(line,), },);
  } catch (error: unknown) {
    skip(`no wasm-capable Rust toolchain: ${error instanceof Error ? error.message : String(error,)}`,);
    return;
  }

  const first = runCheck(toolchain.env,);
  if (first.status === 0) {
    console.log(`[check:wasm] OK ${CRATE} type-checks for ${WASM_TARGET}`,);
    return;
  }

  if (TARGET_MISSING.test(first.output,)) {
    // The toolchain cargo resolves has no wasm32 std. A cold runner carries
    // the target for `stable` but not for the pinned channel, so ask rustup
    // for the active one and retry once.
    if (addTargetToActiveToolchain()) {
      const retry = runCheck({},);
      if (retry.status === 0) {
        console.log(`[check:wasm] OK ${CRATE} type-checks for ${WASM_TARGET}`,);
        return;
      }

      if (!TARGET_MISSING.test(retry.output,)) {
        console.error(retry.output,);
        console.error(`[check:wasm] FAILED: ${CRATE} does not compile for ${WASM_TARGET}`,);
        process.exit(1,);
      }
    }

    skip(
      `the ${WASM_TARGET} target is not installed for the active Rust toolchain - ` +
        `app.rs and web.rs could not be type-checked`,
    );
    return;
  }

  console.error(first.output,);
  console.error(`[check:wasm] FAILED: ${CRATE} does not compile for ${WASM_TARGET}`,);
  process.exit(1,);
}

main();

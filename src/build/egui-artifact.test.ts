// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the egui artifact freshness witness.
 *
 * The hole this closes: `SOURCE_EXCLUDE_DIRS` skipped `native/`, so editing a
 * `.rs` file changed the source hash and build:verify reported "matches local"
 * while the server served a wasm built from older Rust. A check that cannot see
 * the staleness is worse than none, so these pin each verdict it must reach.
 */
import { describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  EGUI_BUNDLE_DIR,
  EGUI_STAMP_FILE,
  readEguiArtifactState,
  rustSourceHash,
  writeEguiStamp,
} from "./egui-artifact";

/** @returns a throwaway repo root with a minimal Rust tree */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "egui-identity-",),);
  mkdirSync(join(root, "native", "loop-lore-egui", "src",), { recursive: true, },);
  writeFileSync(join(root, "native", "loop-lore-egui", "src", "lib.rs",), "fn main() {}\n",);
  return root;
}

/** Plant a bundle + stamp so the fresh/stale comparison has something to read. */
function plant(root: string, stampOverrides?: Record<string, unknown>,): void {
  const dir = join(root, EGUI_BUNDLE_DIR,);
  mkdirSync(dir, { recursive: true, },);
  writeFileSync(join(dir, "app_bg.wasm",), "wasm-bytes",);
  writeEguiStamp(root, { wasmBindgenVersion: "0.2.129", ...stampOverrides, },);
}

describe("egui artifact identity", () => {
  test("absent bundle is supported, not stale", () => {
    const root = makeRoot();
    try {
      const state = readEguiArtifactState(root,);
      expect(state.status,).toBe("absent",);
      expect(state.artifactHash,).toBe("",);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("fresh bundle matches the Rust sources it was built from", () => {
    const root = makeRoot();
    try {
      plant(root,);
      const state = readEguiArtifactState(root,);
      expect(state.status,).toBe("fresh",);
      expect(state.stamp?.rustSourceHash,).toBe(rustSourceHash(root,),);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("editing a .rs file makes the bundle stale", () => {
    // THE regression. Under the old source-hash-only check this was invisible:
    // sourceTreeHash moved, remote/local agreed, and stale wasm was served.
    const root = makeRoot();
    try {
      plant(root,);
      writeFileSync(join(root, "native", "loop-lore-egui", "src", "lib.rs",), "fn main() { let _ = 1; }\n",);
      const state = readEguiArtifactState(root,);
      expect(state.status,).toBe("stale",);
      expect(state.stamp?.rustSourceHash,).not.toBe(state.rustSourceHash,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("a bundle replaced after its build is stale", () => {
    const root = makeRoot();
    try {
      plant(root,);
      writeFileSync(join(root, EGUI_BUNDLE_DIR, "app_bg.wasm",), "swapped",);
      expect(readEguiArtifactState(root,).status,).toBe("stale",);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("a bundle with no readable stamp is stale, not trusted", () => {
    const root = makeRoot();
    try {
      mkdirSync(join(root, EGUI_BUNDLE_DIR,), { recursive: true, },);

      writeFileSync(join(root, EGUI_BUNDLE_DIR, "app_bg.wasm",), "orphaned",);
      writeFileSync(join(root, EGUI_STAMP_FILE,), "{ not json",);
      expect(readEguiArtifactState(root,).status,).toBe("stale",);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("the stamp records the resolved wasm-bindgen CLI version", () => {
    const root = makeRoot();
    try {
      plant(root, { wasmBindgenVersion: "0.2.129", },);
      const path = writeEguiStamp(root, { wasmBindgenVersion: "0.2.129", },);
      expect(path,).toBe(join(root, EGUI_STAMP_FILE,),);
      const stamp = JSON.parse(readFileSync(path, "utf8",),);
      expect(stamp.wasmBindgenVersion,).toBe("0.2.129",);
      expect(stamp.rustSourceHash,).toBe(rustSourceHash(root,),);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });
});

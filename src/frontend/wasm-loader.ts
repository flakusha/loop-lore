// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * WASM module loader for the browser — fetches the pre-compiled hot binary
 * (`loop_lore_native.wasm`) from the static asset dir, instantiates it, and
 * exposes the C ABI functions on `window.__loopLoreWasm` for other frontend
 * modules to consume.
 *
 * The wasm binary is built from `native/loop-lore-native/` (a Rust cdylib
 * crate) and served at `/wasm/loop_lore_native.wasm`. The build stage
 * (`build:native` in scripts/build-native.ts) handles compilation via one of
 * two paths:
 *   - rustup available: `rustup target add wasm32-unknown-unknown` + standard build
 *   - system cargo (no rustup) with rust-src: `build-std` cross-compilation
 *
 * When the wasm module fails to load (network error, unsupported browser)
 * every accessor returns null — callers fall back to JS implementations.
 * @module wasm-loader
 */

/** WASM asset URL (served from dist/public/wasm/). */
import { feFetch, } from "./fe-fetch";
const WASM_URL = "/wasm/loop_lore_native.wasm";

/**
 * Wrapper around the wasm C ABI functions — the same contract defined in
 * the Rust crate's blake3.rs, zstd.rs, and gguf.rs, but callable from the browser.
 */
export interface WasmNativeModule {
  version: number;
  blake3: {
    hash(data: Uint8Array,): Uint8Array | null;
  };
  zstd: {
    compress(data: Uint8Array, level: number,): Uint8Array | null;
    decompress(data: Uint8Array, outCapacity: number,): Uint8Array | null;
    decompressBound(data: Uint8Array,): number | null;
  };
  gguf: {
    probe(header: Uint8Array,): { version: number; tensorCount: number; kvCount: number } | null;
  };
}

let cachedModule: WasmNativeModule | null | undefined;

/** Scratch buffer size for wasm data transfers (64 KiB). */
const SCRATCH_SIZE = 65_536;

/**
 * Fetch and instantiate the wasm module. Cached after first success/failure.
 * @returns The wrapped module, or null on any failure.
 */
export async function getWasmModule(): Promise<WasmNativeModule | null> {
  if (cachedModule !== undefined) { return cachedModule; }

  try {
    const response = await feFetch(WASM_URL,);
    if (!response.ok) {
      cachedModule = null;
      return null;
    }
    const bytes = await response.arrayBuffer();
    const mod = new WebAssembly.Module(bytes,);
    const instance = new WebAssembly.Instance(mod, {},);
    const exports = instance.exports as Record<string, unknown>;
    const memory = exports.memory as WebAssembly.Memory;

    cachedModule = buildWrapper(instance, memory as any,);
    return cachedModule;
  } catch {
    cachedModule = null;
    return null;
  }
}

/**
 * Build a safe JS wrapper around the raw wasm C ABI functions.
 * @param instance
 * @param memory
 */
function buildWrapper(instance: WebAssembly.Instance, memory: WebAssembly.Memory,): WasmNativeModule {
  const {
    ll_version,
    ll_blake3,
    ll_zstd_compress,
    ll_zstd_decompress,
    ll_zstd_decompress_bound,
    ll_gguf_probe,
  } = instance.exports as unknown as {
    ll_version: () => number;
    ll_blake3: (data: number, len: number, out: number, outLen: number,) => number;
    ll_zstd_compress: (data: number, len: number, out: number, outLen: number, level: number,) => number;
    ll_zstd_decompress: (data: number, len: number, out: number, outLen: number,) => number;
    ll_zstd_decompress_bound: (data: number, len: number,) => number | bigint;
    ll_gguf_probe?: (data: number, len: number, out: number, outLen: number,) => number;
  };

  const version = ll_version();

  return {
    version,
    blake3: {
      hash(data: Uint8Array,): Uint8Array | null {
        const dataLen = data.length;
        if (dataLen > SCRATCH_SIZE - 32) { return null; // too large
         }
        const view = new Uint8Array(memory.buffer,);
        view.set(data, 0,);
        const status = ll_blake3(0, dataLen, SCRATCH_SIZE - 32, 32,);
        if (status !== 0) { return null; }
        return new Uint8Array(view.slice(SCRATCH_SIZE - 32, SCRATCH_SIZE,),);
      },
    },
    zstd: {
      compress(data: Uint8Array, level: number,): Uint8Array | null {
        const dataLen = data.length;
        if (dataLen > SCRATCH_SIZE / 2) { return null; }
        const dstMax = SCRATCH_SIZE - dataLen - 1024;
        if (dstMax < 64) { return null; }
        const view = new Uint8Array(memory.buffer,);
        view.set(data, 0,);
        const result = ll_zstd_compress(0, dataLen, dataLen + 512, dstMax, level,);
        if (result < 0) { return null; }
        return new Uint8Array(view.slice(dataLen + 512, dataLen + 512 + result,),);
      },
      decompress(data: Uint8Array, _outCapacity: number,): Uint8Array | null {
        const dataLen = data.length;
        if (dataLen > SCRATCH_SIZE / 2) { return null; }
        const view = new Uint8Array(memory.buffer,);
        view.set(data, 0,);
        // First probe decompress bound
        const bound = ll_zstd_decompress_bound(0, dataLen,);
        const capacity = typeof bound === "bigint" ? Number(bound,) : bound;
        if (capacity < 0 || capacity > SCRATCH_SIZE - dataLen - 1024) { return null; }
        const result = ll_zstd_decompress(0, dataLen, dataLen + 512, capacity,);
        if (result < 0) { return null; }
        return new Uint8Array(view.slice(dataLen + 512, dataLen + 512 + result,),);
      },
      decompressBound(data: Uint8Array,): number | null {
        const dataLen = data.length;
        if (dataLen > SCRATCH_SIZE / 2) { return null; }
        const view = new Uint8Array(memory.buffer,);
        view.set(data, 0,);
        const bound = ll_zstd_decompress_bound(0, dataLen,);
        const result = typeof bound === "bigint" ? Number(bound,) : bound;
        return result < 0 ? null : result;
      },
    },
    gguf: {
      probe(header: Uint8Array,): { version: number; tensorCount: number; kvCount: number } | null {
        if (typeof ll_gguf_probe !== "function") { return null; }
        const headerLen = header.length;
        if (headerLen === 0 || headerLen > SCRATCH_SIZE - 32) { return null; }
        const outAt = SCRATCH_SIZE - 32;
        const view = new Uint8Array(memory.buffer,);
        view.set(header, 0,);
        const status = ll_gguf_probe(0, headerLen, outAt, 32,);
        if (status !== 0) { return null; }
        const summary = new DataView(memory.buffer, outAt, 32,);
        const tensorCount = Number(summary.getBigUint64(8, true,),);
        const kvCount = Number(summary.getBigUint64(16, true,),);
        if (!Number.isSafeInteger(tensorCount,) || !Number.isSafeInteger(kvCount,)) { return null; }
        return { version: summary.getUint32(0, true,), tensorCount, kvCount, };
      },
    },
  };
}

/**
 * Test seam — build the wrapper around scripted exports without a wasm
 * binary (bun has no wasm toolchain in unit-test envs).
 * @param instance Fake instance whose `exports` carry the C ABI functions.
 * @param memory Backing memory for the scratch transfers.
 * @returns The same wrapper `getWasmModule` would return.
 * @internal Test-only; never call from application code.
 */
export function __buildWasmWrapperForTest(
  instance: WebAssembly.Instance,
  memory: WebAssembly.Memory,
): WasmNativeModule {
  return buildWrapper(instance, memory,);
}

/**
 * True when the wasm module is loaded and ready.
 * This is an async check — first call triggers fetch + instantiate.
 * @returns Whether WASM-based blake3+zstd are available.
 */
export async function isWasmAvailable(): Promise<boolean> {
  const mod = await getWasmModule();
  return mod !== null;
}

// ── Script auto-init for Alpine.js / htmx environments ──────────
// When loaded as a script tag, eagerly fetch the wasm module and expose
// it on `window.__loopLoreWasm` for other IIFE bundles to use.

(async function autoInit(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  // Prevent double-init and preserve existing global.
  if (g.__loopLoreWasm !== undefined) { return; }

  // Eager fetch — result stored on window once ready.
  // Failure is non-fatal — callers check return value.
  try {
    g.__loopLoreWasm = await getWasmModule();
  } catch {
    g.__loopLoreWasm = null;
  }
})();

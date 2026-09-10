// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GGUF header probe for the browser — validates a model blob's header and
 * reports its summary (version, tensor count, metadata count) without
 * touching tensor data.
 *
 * WASM-first: `probeGguf` tries the `ll_gguf_probe` export (same semantics
 * as the Rust crate's `gguf` module) and falls back to the pure-TS parser
 * when WASM is unavailable, the binary predates the export, or the header
 * exceeds the WASM scratch buffer. `probeGgufSync` is the sync pure-TS path
 * for callers that already hold the bytes and want no async overhead.
 *
 * Error codes mirror the Rust ABI: -2 bad magic, -3 truncated,
 * -4 corrupt values.
 * @module gguf-probe
 */

import { getWasmModule, } from "../wasm-loader";

/** Validated GGUF header summary. */
export interface GgufSummary {
  version: number;
  tensorCount: number;
  kvCount: number;
}

/** Probe error codes (mirrors the `ll_gguf_probe` ABI). */
export type GgufProbeCode = -2 | -3 | -4;

/** Thrown by {@link probeGgufSync} when the header is not a valid GGUF prefix. */
export class GgufProbeError extends Error {
  readonly code: GgufProbeCode;

  /**
   * @param code Machine-readable failure class.
   * @param message Human-readable detail.
   */
  constructor(code: GgufProbeCode, message: string,) {
    super(message,);
    this.name = "GgufProbeError";
    this.code = code;
  }
}

/** GGUF magic ("GGUF"). */
const GGUF_MAGIC = [0x47, 0x47, 0x55, 0x46,] as const;

/** Upper bound for any length prefix or count (mirrors `MAX_SPAN`). */
const MAX_SPAN = 4294967296;

/** Bounds-checked little-endian cursor over the header bytes. */
class Cursor {
  private pos = 0;

  /**
   * @param bytes Header bytes (a prefix of the blob suffices).
   */
  constructor(private readonly bytes: Uint8Array,) {}

  private get rest(): number {
    return this.bytes.length - this.pos;
  }

  /**
   * Consume `len` bytes.
   * @param len Byte count to consume.
   * @throws {GgufProbeError} -3 when fewer than `len` bytes remain.
   */
  take(len: number,): Uint8Array {
    if (len > this.rest) {
      throw new GgufProbeError(-3, `gguf header truncated (need ${len}, have ${this.rest})`,);
    }
    const start = this.pos;
    this.pos += len;
    return this.bytes.subarray(start, start + len,);
  }

  /**
   * Read a little-endian u32.
   * @throws {GgufProbeError} -3 on truncation.
   */
  u32(): number {
    const raw = this.take(4,);
    const b0 = raw[0] ?? 0;
    const b1 = raw[1] ?? 0;
    const b2 = raw[2] ?? 0;
    const b3 = raw[3] ?? 0;
    return b0 + b1 * 256 + b2 * 65536 + b3 * 16777216;
  }

  /**
   * Read a little-endian u64. Exact for values under 2^53; larger values
   * saturate to infinity (callers reject both via `MAX_SPAN`).
   * @throws {GgufProbeError} -3 on truncation.
   */
  u64(): number {
    const raw = this.take(8,);
    const lo = (raw[0] ?? 0) + (raw[1] ?? 0) * 256 + (raw[2] ?? 0) * 65536 + (raw[3] ?? 0) * 16777216;
    const hi = (raw[4] ?? 0) + (raw[5] ?? 0) * 256 + (raw[6] ?? 0) * 65536 + (raw[7] ?? 0) * 16777216;
    if (hi >= 2097152) {
      return Number.POSITIVE_INFINITY;
    }
    return lo + hi * 4294967296;
  }

  /**
   * Skip `len` bytes.
   * @param len Byte count to skip.
   * @throws {GgufProbeError} -3 on truncation, -4 on absurd lengths.
   */
  skip(len: number,): void {
    if (len > MAX_SPAN || len > this.rest) {
      const code: GgufProbeCode = len > MAX_SPAN ? -4 : -3;
      throw new GgufProbeError(code, `gguf span out of range (len ${len}, rest ${this.rest})`,);
    }
    this.pos += len;
  }

  /**
   * Skip one length-prefixed string.
   * @throws {GgufProbeError} -3 on truncation, -4 on absurd lengths.
   */
  ggufString(): void {
    this.skip(this.u64(),);
  }
}

/**
 * Skip one metadata value of the given GGUF type tag.
 * @param cursor Header cursor.
 * @param tag GGUF metadata type tag (0-12).
 * @throws {GgufProbeError} -3 on truncation, -4 on corrupt tags.
 */
function skipValue(cursor: Cursor, tag: number,): void {
  if (tag === 0 || tag === 1) {
    cursor.skip(1,); // uint8 | int8
  } else if (tag === 2 || tag === 3) {
    cursor.skip(2,); // uint16 | int16
  } else if (tag >= 4 && tag <= 7) {
    cursor.skip(4,); // uint32 | int32 | float32 | bool
  } else if (tag >= 10 && tag <= 12) {
    cursor.skip(8,); // uint64 | int64 | float64
  } else if (tag === 8) {
    cursor.ggufString(); // string
  } else if (tag === 9) {
    const elem = cursor.u32();
    const count = cursor.u64();
    if (elem === 9 || count > MAX_SPAN) {
      throw new GgufProbeError(-4, `gguf nested array or excessive count (${count})`,);
    }
    for (let i = 0; i < count; i += 1) {
      skipValue(cursor, elem,);
    }
  } else {
    throw new GgufProbeError(-4, `gguf unknown metadata type ${tag}`,);
  }
}

/**
 * Parse and validate GGUF header bytes (pure TS, synchronous).
 * @param data Header prefix of the blob — the walk stops after the last
 * tensor info, so a prefix ending there suffices; anything longer is ignored.
 * @returns The header summary.
 * @throws {GgufProbeError} -2 bad magic, -3 truncated, -4 corrupt.
 */
export function probeGgufSync(data: Uint8Array,): GgufSummary {
  const cursor = new Cursor(data,);
  const magic = cursor.take(4,);
  if (
    magic[0] !== GGUF_MAGIC[0] || magic[1] !== GGUF_MAGIC[1] ||
    magic[2] !== GGUF_MAGIC[2] || magic[3] !== GGUF_MAGIC[3]
  ) {
    throw new GgufProbeError(-2, "not a GGUF blob (bad magic)",);
  }
  const version = cursor.u32();
  const tensorCount = cursor.u64();
  const kvCount = cursor.u64();
  if (tensorCount > MAX_SPAN || kvCount > MAX_SPAN) {
    throw new GgufProbeError(-4, "gguf absurd tensor/kv counts",);
  }
  for (let i = 0; i < kvCount; i += 1) {
    cursor.ggufString();
    skipValue(cursor, cursor.u32(),);
  }
  for (let i = 0; i < tensorCount; i += 1) {
    cursor.ggufString();
    const nDims = cursor.u32();
    if (nDims > 4) {
      throw new GgufProbeError(-4, `gguf tensor has ${nDims} dims (max 4)`,);
    }
    for (let d = 0; d < nDims; d += 1) {
      cursor.u64();
    }
    cursor.u32(); // ggml type
    cursor.u64(); // offset
  }
  return { version, tensorCount, kvCount, };
}

/**
 * Probe a GGUF header, preferring the WASM export, falling back to pure TS.
 * Never throws for missing WASM — only for invalid data.
 * @param data Header prefix of the blob.
 * @returns The header summary.
 * @throws {GgufProbeError} -2 bad magic, -3 truncated, -4 corrupt.
 */
export async function probeGguf(data: Uint8Array,): Promise<GgufSummary> {
  const mod = await getWasmModule();
  const viaWasm = mod?.gguf.probe(data,) ?? null;
  if (viaWasm !== null) {
    return viaWasm;
  }
  return probeGgufSync(data,);
}

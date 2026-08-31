// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser-side UUIDv7 generator.
 *
 * Produces time-sortable UUIDs (RFC 9562 §5.7) using only the WebCrypto API
 * (`crypto.getRandomValues`). Designed to mirror the server-side
 * `Bun.randomUUIDv7()` output so client and server ids share the same shape
 * and chronological ordering properties.
 *
 * Layout (128 bits, big-endian textual form):
 *
 *   0                   1                   2                   3
 *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                           unix_ts_ms                          |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |          unix_ts_ms           |  ver  |       rand_a          |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |var|                        rand_b                             |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                            rand_b                             |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *
 *  - Bits 0–47: unix milliseconds (48 bits)
 *  - Bits 48–51: version, MUST be `0111` (7)
 *  - Bits 52–63: rand_a (12 bits)
 *  - Bits 64–65: variant, MUST be `10`
 *  - Bits 66–127: rand_b (62 bits)
 *
 * Textual canonical form follows RFC 9562 §4 (lowercase hex, hyphenated).
 */

/**
 * Options accepted by {@link browserRandomUUIDv7}.
 */
export interface BrowserUUIDv7Options {
  /**
   * Override the unix-ms timestamp embedded in the id. Defaults to
   * `Date.now()`. Mostly useful for tests; production code should leave
   * it unset.
   */
  timestampMs?: number;
  /**
   * Override the randomness source. Defaults to `crypto.getRandomValues`.
   * Must fill the provided `Uint8Array` with cryptographically random bytes.
   * Mostly useful for tests.
   */
  random?: <T extends ArrayBufferView,>(buf: T,) => T;
}

const HEX = "0123456789abcdef";
const VERSION = 0x7;
const VARIANT = 0b10;

/**
 * @param bytes
 */
function bytesToHex(bytes: Uint8Array,): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    out += HEX[(b >>> 4) & 0xf];
    out += HEX[b & 0xf];
  }
  return out;
}

/**
 * Produce a new UUIDv7 string (RFC 9562 §5.7) using `crypto.getRandomValues`.
 *
 * Output is lowercase, hyphenated, e.g. `018e4c5a-7b21-7a23-9f12-3c9d8e7b2a4f`.
 * The high 48 bits encode the unix-ms timestamp; calls in the same
 * millisecond are still sortable because the random tail is freshly
 * generated each call (the probability of collision across N calls in
 * the same ms is roughly N^2 / 2^74, comfortably negligible for any
 * realistic client-side fan-out).
 * @param opts - Optional overrides for timestamp or randomness source.
 * @returns A new UUIDv7 string.
 * @example
 * ```ts
 * const id = browserRandomUUIDv7(); // "018e4c5a-7b21-7a23-9f12-3c9d8e7b2a4f"
 * ```
 */
export function browserRandomUUIDv7(opts: BrowserUUIDv7Options = {},): string {
  const timestamp = opts.timestampMs ?? Date.now();
  if (!Number.isFinite(timestamp,) || timestamp < 0 || !Number.isInteger(timestamp,)) {
    throw new RangeError("browserRandomUUIDv7: timestampMs must be a non-negative integer",);
  }
  // 48-bit unix_ms + 4-bit version + 12-bit rand_a + 2-bit variant + 62-bit rand_b = 128 bits.
  const buf = new Uint8Array(16,);
  const rng = opts.random ?? crypto.getRandomValues.bind(crypto,);
  rng(buf,);

  // Encode unix_ms (48 bits) into bytes 0..5 big-endian.
  let ts = timestamp;
  for (let i = 5; i >= 0; i--) {
    buf[i] = ts & 0xff;
    ts = Math.floor(ts / 0x100,);
  }

  // Force version=7 in the high nibble of byte 6.
  buf[6] = ((buf[6] ?? 0) & 0x0f) | (VERSION << 4);

  // Force variant=10xx in the high two bits of byte 8.
  buf[8] = ((buf[8] ?? 0) & 0x3f) | (VARIANT << 6);

  const hex = bytesToHex(buf,);
  return (
    hex.slice(0, 8,) +
    "-" +
    hex.slice(8, 12,) +
    "-" +
    hex.slice(12, 16,) +
    "-" +
    hex.slice(16, 20,) +
    "-" +
    hex.slice(20, 32,)
  );
}

/**
 * Test the shape of an arbitrary string against the UUIDv7 canonical form.
 * @param value - String to test.
 * @returns True iff the string parses as a UUIDv7.
 */
export function isUUIDv7(value: string,): boolean {
  if (!UUID_RE.test(value,)) { return false; }
  if (value[14] !== "7") { return false; }
  const variant = value[19];
  return variant === "8" || variant === "9" || variant === "a" || variant === "b";
}

// Canonical UUID layout (any version). We re-check version + variant
// separately so the same regex can also serve non-v7 ids elsewhere.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

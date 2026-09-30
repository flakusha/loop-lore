// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe buffer default limits.
 */

/** Default max uncompressed size: 10 MB */
const DEFAULT_MAX_SIZE = 10_485_760;
/** Default max compression ratio (decompressed / compressed) */
const DEFAULT_MAX_RATIO = 1000;
/**
 * Hard ceiling on base64 input length before decode, regardless of the
 * caller's own cap: 20 MB encoded. The effective per-call limit is derived
 * from `maxSize` and is usually far smaller (the default 10 MB cap allows
 * ~14 MB encoded), so this only binds when a caller passes a very large
 * `maxSize`.
 */
const DEFAULT_MAX_BASE64_LEN = 20_971_520; // 20 MB encoded

/**
 * Max cursor length: 512 chars. A pagination cursor encodes one row
 * boundary (ISO timestamp + UUID) — 512 is ~10x any real value, and far
 * below the 10 MB asset default that made oversized cursors undetectable.
 */
const MAX_CURSOR_LEN = 512;

/**
 * Max key-envelope length: 8 KB. Wraps a raw or wrapped content key, so
 * it stays well under a typical key size but catches a buffer mix-up.
 */
const MAX_KEY_LEN = 8_192;

export {
  DEFAULT_MAX_BASE64_LEN,
  DEFAULT_MAX_RATIO,
  DEFAULT_MAX_SIZE,
  MAX_CURSOR_LEN,
  MAX_KEY_LEN,
};

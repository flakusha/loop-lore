// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { fromBase64, toBase64, } from "../utils/base64";

/**
 * @param str
 */
export function stringToUint8Array(str: string,): Uint8Array {
  return new TextEncoder().encode(str,);
}

/**
 * @param buf
 */
export function uint8ArrayToString(buf: Uint8Array,): string {
  return new TextDecoder().decode(buf,);
}

/**
 * @param buf
 */
export function uint8ArrayToBase64(buf: Uint8Array,): string {
  return toBase64(buf,);
}

/**
 * @param b64
 */
export function base64ToUint8Array(b64: string,): Uint8Array {
  return fromBase64(b64,);
}

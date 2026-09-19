// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Asset base64url codec (split from signed-url.ts for size). */
import { fromBase64, toBase64, } from "../utils/base64";

/**
 * Base64url encode (RFC 4648 §5, unpadded) — mirrors src/auth/jwt.ts.
 * @param data
 * @returns the unpadded base64url string
 */
export function base64urlEncode(data: Uint8Array,): string {
  return toBase64(data,).replaceAll("+", "-",).replaceAll("/", "_",).replace(/=+$/, "",);
}

/**
 * Base64url decode (tolerates missing padding).
 * @param str
 * @returns the decoded bytes
 */
export function base64urlDecode(str: string,): Uint8Array {
  const base64 = str.replaceAll("-", "+",).replaceAll("_", "/",);
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
  return fromBase64(padded,);
}

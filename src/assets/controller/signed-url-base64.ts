// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Base64url helpers for asset signed URLs (mirror src/auth/jwt.ts). */
import { fromBase64, toBase64, } from "../../utils/base64";

/**
 * @param data
 * @returns void
 */
export function base64urlEncode(data: Uint8Array,): string {
  return toBase64(data,).replaceAll("+", "-",).replaceAll("/", "_",).replace(/=+$/, "",);
}

/**
 * @param str
 * @returns void
 */
export function base64urlDecode(str: string,): Uint8Array {
  const base64 = str.replaceAll("-", "+",).replaceAll("_", "/",);
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
  return fromBase64(padded,);
}

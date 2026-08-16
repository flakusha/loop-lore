// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeCompress, safeFromString, safeToBase64, } from "../utils/safe-buffer";
import type { ContentEncoding, EncodeResult, } from "./types";

export function encodeContent(plaintext: string, encoding: ContentEncoding,): EncodeResult {
  if (encoding === "identity" || !plaintext) {
    return { encoded: plaintext, encoding: "identity", };
  }

  const bufferResult = safeFromString(plaintext, "utf8",);
  if (!bufferResult.ok) {
    throw bufferResult.error;
  }

  const compressedResult = safeCompress(bufferResult.buffer, encoding,);
  if (!compressedResult.ok) {
    throw compressedResult.error;
  }

  const base64Result = safeToBase64(compressedResult.buffer,);
  if (!base64Result.ok) {
    throw base64Result.error;
  }

  return { encoded: base64Result.buffer, encoding, };
}

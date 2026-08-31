// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeDecompress, safeFromBase64, } from "../utils/safe-buffer";
import type { ContentEncoding, } from "./types";

/**
 * @param stored
 * @param encoding
 */
export function decodeContent(stored: string, encoding: ContentEncoding,): string {
  if (encoding === "identity" || !stored) {
    return stored;
  }

  const bufferResult = safeFromBase64(stored,);
  if (!bufferResult.ok) {
    throw bufferResult.error;
  }

  const decompressedResult = safeDecompress(bufferResult.buffer, encoding,);
  if (!decompressedResult.ok) {
    throw decompressedResult.error;
  }

  return decompressedResult.buffer.toString("utf8",);
}

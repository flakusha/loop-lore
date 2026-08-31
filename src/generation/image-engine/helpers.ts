// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeFromBase64, } from "../../utils/safe-buffer";
import type { ImageGenFailure, ImageGenSuccess, } from "./types";

/**
 * @param error
 * @param status
 */
export function failure(error: string, status: number,): ImageGenFailure {
  return { ok: false, error, status, };
}

/**
 * @param images
 * @param mimeType
 */
export function ok(images: Buffer[], mimeType: string,): ImageGenSuccess {
  return { ok: true, images, mimeType, };
}

/**
 * @param value
 */
export function decodeB64(value: string,): Buffer {
  const r = safeFromBase64(value,);
  return r.ok ? r.buffer : Buffer.alloc(0,);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { mustFromBase64, } from "../../utils/safe-buffer";
import type { ImageGenFailure, ImageGenOutcome, ImageGenSuccess, } from "./types";

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
 * Decode a provider-returned base64 image.
 * @throws {SafeBufferError} when the provider returned undecodable image data
 */
export function decodeB64(value: string,): Buffer {
  // A provider that returns undecodable base64 is a generation failure, not
  // an empty image. Returning a 0-byte buffer persisted a broken image and
  // reported success to the caller.
  return mustFromBase64(value,);
}

/**
 * Decode a provider's image list, mapping undecodable data to a failure
 * outcome rather than propagating the throw past the `ImageGenOutcome`
 * contract or yielding 0-byte images.
 * @param values - base64 image payloads from the provider
 * @param mimeType - MIME type recorded on success
 */
export function decodeImages(values: string[], mimeType: string,): ImageGenOutcome {
  try {
    return ok(Array.from(values, (v,) => decodeB64(v,),), mimeType,);
  } catch (error) {
    return failure(`Image generation failed: ${(error as Error).message}`, 502,);
  }
}

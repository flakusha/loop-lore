// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-request CSP nonce storage.
 *
 * A cryptographic nonce is generated once per HTML request and stored in a
 * WeakMap keyed by the Request object. Both the response-header middleware
 * (CSP header) and the view renderer (inline `<script>` tags) read it from
 * here so the same nonce appears in both places.
 *
 * The nonce is base64url-encoded, 16 bytes (128 bits) — sufficient entropy
 * for CSP while keeping the header value compact.
 */

import { randomBytes, } from "node:crypto";

const NONCE_LENGTH = 16;

/** Request → nonce WeakMap. Entries are GC'd when the Request is collected. */
const nonceStore = new WeakMap<Request, string>();

/**
 * Generate a fresh CSP nonce and associate it with the given request.
 * Call once per request, before any middleware reads it.
 * @param request - The incoming Request to key the nonce on.
 * @returns The base64url-encoded nonce string.
 */
export function generateNonce(request: Request,): string {
  const nonce = randomBytes(NONCE_LENGTH,).toString("base64url",);
  nonceStore.set(request, nonce,);
  return nonce;
}

/**
 * Retrieve the CSP nonce for a request, or `null` if none was generated.
 * @param request - The incoming Request.
 * @returns The nonce string, or null.
 */
export function getNonce(request: Request,): string | null {
  return nonceStore.get(request,) ?? null;
}

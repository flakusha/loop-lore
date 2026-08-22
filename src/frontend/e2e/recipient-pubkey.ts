// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser-side E2E public-key fetch (TASK-asymmetric-key-pairs-followup — Phase A)
 *
 * Fetches the active ECDH public key for an actor via the route registered
 * in `src/routes/actor-e2e-pubkeys.ts`. Returns `null` if the actor has no
 * active key (the recipient is not opted in to E2E).
 *
 * The HTTP call is the only network dependency in the encrypt pipeline.
 * Returns the deserialized `JsonWebKey` ready for `importPublicKey()`.
 */

/** Server base URL with no trailing slash. Falls back to current origin. */
function apiBase(): string {
  if (typeof window === "undefined") { return ""; }
  return window.location.origin;
}

/**
 * Fetch the active ECDH public key for an actor.
 * Returns null if the actor has no active key (404 from the route).
 * Throws on other network / parse errors.
 */
export async function fetchRecipientPublicKey(actorId: string,): Promise<JsonWebKey | null> {
  const url = `${apiBase()}/api/actors/${encodeURIComponent(actorId,)}/e2e-public-key`;
  const res = await fetch(url, { credentials: "include", },);
  if (res.status === 404) { return null; }
  if (!res.ok) {
    throw new Error(`recipient pubkey fetch failed: ${res.status} ${res.statusText}`,);
  }
  const body = (await res.json()) as { publicKeyJwk?: JsonWebKey };
  if (!body.publicKeyJwk) {
    throw new Error("recipient pubkey response missing publicKeyJwk",);
  }
  return body.publicKeyJwk;
}

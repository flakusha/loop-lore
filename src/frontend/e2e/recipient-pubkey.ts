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
import { safeFetch, } from "../../utils";

/** Server base URL with no trailing slash. Falls back to current origin. */
function apiBase(): string {
  if (typeof window === "undefined") { return ""; }
  return window.location.origin;
}

/**
 * Fetch the active ECDH public key for an actor.
 * Returns null if the actor has no active key (404 from the route).
 * Throws on other network / parse errors.
 * @param actorId
 */
export async function fetchRecipientPublicKey(actorId: string,): Promise<JsonWebKey | null> {
  const url = `${apiBase()}/api/actors/${encodeURIComponent(actorId,)}/e2e-public-key`;
  const result = await safeFetch<{ publicKeyJwk?: JsonWebKey }>(url, {
    credentials: "include",
    handle401: false,
  },);
  if (!result.ok) {
    if (result.status === 404) { return null; }
    throw new Error(`recipient pubkey fetch failed: ${result.error.message}`,);
  }
  if (!result.data.publicKeyJwk) {
    throw new Error("recipient pubkey response missing publicKeyJwk",);
  }
  return result.data.publicKeyJwk;
}

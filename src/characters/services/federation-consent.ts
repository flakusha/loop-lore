// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Federation consent gate for character ActivityPub publication.
 *
 * Migration 069 added `characters.federation_consent` (default 0) but no code
 * reads it. This service is the single source of truth for the gate; every
 * future publish/announce/deliver path must call {@link assertFederationConsent}
 * (or check {@link getFederationConsent}) before doing federation work.
 *
 * Until the federation publish endpoints land, this gate has no call sites -
 * that's expected. The helper is wired so the migration's intent is honored
 * the moment a publish path is added, and so we have a tested, named boundary
 * to expand when the feature grows.
 *
 * See .plan/tickets/BUG-character-federation-lacks-owner-consent-or-nsfw-gate.md.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
/** Error raised when federation consent requirements are not met. */
export class FederationConsentError extends Error {
  constructor(
    public readonly actorId: string,
    public readonly consent: boolean,
    message?: string,
  ) {
    super(
      message ??
        `Character ${actorId} has not opted in to federation (federation_consent=${consent ? 1 : 0})`,
    );
    this.name = "FederationConsentError";
  }
}

/** Raw boolean read of the actor's federation_consent flag. */
export async function getFederationConsent(
  database: Kysely<DB>,
  actorId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("characters",)
    .select("federation_consent",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  return row ? row.federation_consent === 1 : false;
}

/**
 * Throws FederationConsentError unless the actor's character row has
 * federation_consent = 1. Callers MUST invoke this before any federation
 * side effect (generating AP keys, publishing an Actor, signing a
 * delivery, etc.). The gate is intentionally synchronous in failure mode
 * so callers cannot accidentally forget to check.
 */
export async function assertFederationConsent(
  database: Kysely<DB>,
  actorId: string,
): Promise<void> {
  const consent = await getFederationConsent(database, actorId,);
  if (!consent) {
    throw new FederationConsentError(actorId, consent,);
  }
}

/**
 * Set the federation consent flag (owner/admin only - caller is responsible
 * for authorization; this service does not check ownership).
 *
 * Pass `true` to opt the character into federation, `false` to opt out.
 * Setting consent to false does not revoke already-issued ActivityPub
 * signing keys; key revocation is handled separately by the key-rotation
 * flow in `crypto/activitypub-keys.ts`.
 */
export async function setFederationConsent(
  database: Kysely<DB>,
  actorId: string,
  consent: boolean,
): Promise<void> {
  await database
    .updateTable("characters",)
    .set({ federation_consent: consent ? 1 : 0, },)
    .where("id", "=", actorId,)
    .execute();
}

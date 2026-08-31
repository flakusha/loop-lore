// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ActivityPub Signing Keys Service.
 *
 * Manages per-actor Ed25519 signing keypairs for ActivityPub federation.
 * Private keys are encrypted at rest with the SMK (Storage Master Key).
 * Supports key rotation: multiple keys per actor, only one active at a time.
 *
 * This is separate from the encryption actor-keys.ts which manages AES
 * chat encryption keys. Signing keys are used for HTTP Signatures in
 * ActivityPub federation.
 */
import type { Kysely, } from "kysely";
import { assertFederationConsent, } from "../characters/services/federation-consent";
import { encryptBytes, } from "../crypto/actor-keys";
import type { DB, } from "../db/schema";
import { safeJsonStringify, } from "../utils";
import { getSmk, } from "./smk";
export interface ActivityPubActorKey {
  id: string;
  actor_id: string;
  key_id: string;
  public_jwk: string;
  status: "active" | "expired" | "rotated";
  rotated_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface GeneratedActivityPubKey {
  key: ActivityPubActorKey;
  privateKey: CryptoKey;
}

/**
 * Generate a new Ed25519 keypair for an actor and store it encrypted at rest.
 */
export async function generateActivityPubKey(
  database: Kysely<DB>,
  actorId: string,
): Promise<GeneratedActivityPubKey> {
  // Federation-consent gate: refuse to mint a signing key for a character
  // whose owner has not opted into ActivityPub publication. See
  // BUG-character-federation-lacks-owner-consent-or-nsfw-gate.
  await assertFederationConsent(database, actorId,);
  const smk = getSmk();
  if (!smk) { throw new Error("Encryption not configured — set SERVER_ENCRYPTION_KEY",); }

  // Generate Ed25519 keypair.
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519", },
    true,
    ["sign", "verify",],
  );

  // Export public key as JWK.
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey,);
  const publicJwkResult = safeJsonStringify(publicJwk,);
  if (!publicJwkResult.ok) { throw new Error(`Failed to serialize public JWK: ${publicJwkResult.error.message}`,); }

  // Export private key as JWK and encrypt at rest.
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey,);
  const privateJwkResult = safeJsonStringify(privateJwk,);
  if (!privateJwkResult.ok) { throw new Error(`Failed to serialize private JWK: ${privateJwkResult.error.message}`,); }
  const encryptedPrivate = await encryptBytes(smk, new TextEncoder().encode(privateJwkResult.value,),);

  const keyId = `ap-key-${actorId}-${Date.now()}`;
  const now = new Date().toISOString();

  // Expire any existing active keys for this actor.
  await database
    .updateTable("activitypub_actor_keys",)
    .set({ status: "rotated", rotated_at: now, },)
    .where("actor_id", "=", actorId,)
    .where("status", "=", "active",)
    .execute();

  const id = crypto.randomUUID();
  await database
    .insertInto("activitypub_actor_keys",)
    .values({
      id,
      actor_id: actorId,
      key_id: keyId,
      public_jwk: publicJwkResult.value,
      encrypted_private_jwk: Buffer.from(encryptedPrivate,).toString("base64",),
      status: "active",
      created_at: now,
    },)
    .execute();

  return {
    key: {
      id,
      actor_id: actorId,
      key_id: keyId,
      public_jwk: publicJwkResult.value,
      status: "active",
      rotated_at: null,
      created_at: now,
      expires_at: null,
    },
    privateKey: keyPair.privateKey,
  };
}

/**
 * Get the active signing key for an actor.
 */
export async function getActiveActivityPubKey(
  database: Kysely<DB>,
  actorId: string,
): Promise<ActivityPubActorKey | null> {
  const row = await database
    .selectFrom("activitypub_actor_keys",)
    .select([
      "id",
      "actor_id",
      "key_id",
      "public_jwk",
      "status",
      "rotated_at",
      "created_at",
      "expires_at",
    ],)
    .where("actor_id", "=", actorId,)
    .where("status", "=", "active",)
    .executeTakeFirst();

  if (!row) { return null; }

  return {
    id: row.id,
    actor_id: row.actor_id,
    key_id: row.key_id,
    public_jwk: row.public_jwk,
    status: row.status as ActivityPubActorKey["status"],
    rotated_at: row.rotated_at,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

/**
 * Rotate an actor's ActivityPub signing key — generates a new keypair and expires the old one.
 */
export async function rotateActivityPubKey(
  database: Kysely<DB>,
  actorId: string,
): Promise<GeneratedActivityPubKey> {
  return generateActivityPubKey(database, actorId,);
}

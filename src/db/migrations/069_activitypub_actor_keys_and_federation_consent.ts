// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 069 — ActivityPub actor signing keys + character federation consent.
 *
 * Adds:
 * 1. `activitypub_actor_keys` table — stores per-actor Ed25519 signing keypairs
 *    for ActivityPub federation. Private keys are encrypted at rest with the SMK.
 *    Supports key rotation (multiple keys per actor, only one active).
 * 2. `characters.federation_consent` — opt-in flag gating whether a character
 *    may be published as a fediverse actor. Without consent, federation
 *    endpoints MUST refuse to publish the character.
 *
 * See .plan/tickets/BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-cry.md
 * and .plan/tickets/BUG-character-federation-lacks-owner-consent-or-nsfw-gate.md.
 */
import { type Kysely, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // 1. ActivityPub signing keys table.
  await database.schema
    .createTable("activitypub_actor_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text", (col,) => col.notNull(),)
    .addColumn("public_jwk", "text", (col,) => col.notNull(),)
    .addColumn("encrypted_private_jwk", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("rotated_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    .addForeignKeyConstraint("fk_ap_actor_keys_actor", ["actor_id",], "actors", ["id",],)
    .execute();

  await database.schema
    .createIndex("idx_ap_actor_keys_actor_status",)
    .on("activitypub_actor_keys",)
    .columns(["actor_id", "status",],)
    .execute();

  // 2. Character federation consent flag.
  await database.schema
    .alterTable("characters",)
    .addColumn("federation_consent", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("characters",)
    .dropColumn("federation_consent",)
    .execute();

  await database.schema
    .dropTable("activitypub_actor_keys",)
    .execute();
}

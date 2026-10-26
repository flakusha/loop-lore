// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 080_byok_key_version
 *
 * Add `key_version` to the two tables that carry BYOK-encrypted values
 * (`user_api_keys.api_key_encrypted`, `mesh_peers.shared_token_enc`).
 *
 * Default 1 = the bare (unversioned) wire format every existing row uses.
 * Rows sealed with `encryptVersioned` (`v2:salt:iv:ciphertext`) carry 2.
 * `decryptValue` (src/crypto/byok.ts) accepts BOTH, so reads need no
 * migration pass; a future one-shot re-encrypt under a per-generation key
 * updates this column instead of guessing from the ciphertext shape.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("user_api_keys",)
    .addColumn("key_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();

  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("key_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("mesh_peers",).dropColumn("key_version",).execute();
  await database.schema.alterTable("user_api_keys",).dropColumn("key_version",).execute();
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Encryption Level rename — `private` → `at-rest`
 * (TASK-asymmetric-key-pairs-followup — Phase D)
 *
 * The runtime tier symbol was updated:
 *   EncryptionLevel.Private  → EncryptionLevel.AtRest
 * with the same storage value `private` renamed to `at-rest` so the wire
 * shape reflects that the server cannot decrypt (true E2E).
 *
 * This migration rewrites existing rows so live deployments roll forward
 * cleanly without any backfill hazard. The mapping is:
 *
 *   chats.encryption_level:
 *     "private" → "at-rest"
 *
 * No row should end up with the legacy `"public"` sentinel — that was
 * already removed by `009_encryption_level_default`. Idempotency: a row
 * that is already `"at-rest"` is left untouched; CHECK constraint not
 * enforced here (no separate constraint migration).
 *
 * Out of scope (deliberately not migrated by this file):
 *   - `messages.content` with `{algo:"e2e",...}` shape: the server
 *     already stored these correctly and the new at-rest tests assert
 *     the wire shape via the helper `isE2eOrEncrypted`.
 *   - `assets` table `encryption_level` columns referenced by
 *     `016_asset_encryption.ts`: that migration uses `"standard"` and
 *     `"private"` was NOT a value used for assets. No change needed.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // SQLite enforces a CHECK constraint only if one was declared; this
  // column is plain TEXT and the only historical values are the four
  // documented tiers. Rename in-place; row count of affected rows is
  // surfaced in the test migration's effect.log for diagnostic review.
  await sql`UPDATE chats SET encryption_level = 'at-rest' WHERE encryption_level = 'private'`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  // Reverse the rename for rollback safety.
  await sql`UPDATE chats SET encryption_level = 'private' WHERE encryption_level = 'at-rest'`.execute(
    db,
  );
}

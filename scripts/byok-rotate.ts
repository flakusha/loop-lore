// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Offline BYOK master-secret rotation. Fail-closed: a row is written only
 * after it decrypts and re-encrypts. Dry-run runs inside a rolled-back
 * transaction; --apply persists. --generate prints a fresh secret and exits.
 */

import type { Kysely, } from "kysely";
import {
  BYOK_KEY_VERSION,
  decryptValue,
  deriveUserKek,
  encryptVersioned,
  kekAad,
} from "../src/crypto";
import { getDatabase, } from "../src/db/index";
import type { DB, } from "../src/db/schema";

export interface RotationFailure {
  table: string;
  id: string;
  reason: string;
}

export interface RotationResult {
  usersReencrypted: number;
  peersReencrypted: number;
  failures: RotationFailure[];
}

export interface RotateByokSecretsOptions {
  database: Kysely<DB>;
  oldSecret: string;
  newSecret: string;
}

/**
 * Re-seal every stored BYOK secret under newSecret.
 * user_api_keys follows the runtime resolver in
 * src/generation/providers/user-api-key.ts: key_version >= 3 opens under the
 * per-user KEK with userId:provider AAD; older rows use the global secret
 * without AAD. mesh_peers tokens are always global-secret sealed.
 */
export async function rotateByokSecrets({
  database,
  oldSecret,
  newSecret,
}: RotateByokSecretsOptions,): Promise<RotationResult> {
  const result: RotationResult = {
    usersReencrypted: 0,
    peersReencrypted: 0,
    failures: [],
  };

  const fail = (table: string, id: string, error: unknown,) => {
    result.failures.push({
      table,
      id,
      reason: error instanceof Error ? error.message : String(error,),
    },);
  };

  const userRows = await database
    .selectFrom("user_api_keys",)
    .select(["id", "user_id", "provider_name", "api_key_encrypted", "key_version",],)
    .execute();

  for (const row of userRows) {
    try {
      const usesKek = (row.key_version ?? 1) >= 3;
      const oldKey = usesKek ? await deriveUserKek(oldSecret, row.user_id,) : oldSecret;
      const aad = usesKek ? kekAad(row.user_id, row.provider_name,) : undefined;
      const plaintext = await decryptValue(row.api_key_encrypted, oldKey, aad,);

      const resealed = await encryptVersioned(
        plaintext,
        await deriveUserKek(newSecret, row.user_id,),
        kekAad(row.user_id, row.provider_name,),
      );

      await database
        .updateTable("user_api_keys",)
        .set({ api_key_encrypted: resealed, key_version: BYOK_KEY_VERSION, },)
        .where("id", "=", row.id,)
        .execute();
      result.usersReencrypted += 1;
    } catch (error) {
      fail("user_api_keys", row.id, error,);
    }
  }

  const peerRows = await database
    .selectFrom("mesh_peers",)
    .select(["origin", "shared_token_enc",],)
    .execute();

  for (const row of peerRows) {
    if (row.shared_token_enc === null) { continue; }
    try {
      const plaintext = await decryptValue(row.shared_token_enc, oldSecret,);
      const resealed = await encryptVersioned(plaintext, newSecret,);
      await database
        .updateTable("mesh_peers",)
        .set({ shared_token_enc: resealed, key_version: BYOK_KEY_VERSION, },)
        .where("origin", "=", row.origin,)
        .execute();
      result.peersReencrypted += 1;
    } catch (error) {
      fail("mesh_peers", row.origin, error,);
    }
  }

  return result;
}

/** Thrown inside a transaction to roll a dry-run back. */
class DryRunRollback extends Error {
  constructor() {
    super("dry-run rollback",);
  }
}

/** Fresh base64url-encoded 32-byte secret. */
function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32,),);
  return bytes.toBase64().replace(/\+/g, "-",).replace(/\//g, "_",).replace(/=+$/, "",);
}

function report(result: RotationResult,): void {
  console.error(`users re-encrypted: ${result.usersReencrypted}`,);
  console.error(`peers re-encrypted: ${result.peersReencrypted}`,);
  console.error(`failures: ${result.failures.length}`,);
  for (const failure of result.failures) {
    console.error(`  ${failure.table} ${failure.id}: ${failure.reason}`,);
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2,);

  if (args.includes("--generate",)) {
    console.log(generateSecret(),);
    return 0;
  }

  const unknown = args.filter((arg,) => arg !== "--apply");
  if (unknown.length > 0) {
    console.error(`Unknown arguments: ${unknown.join(" ",)}`,);
    return 1;
  }

  const oldSecret = process.env.BYOK_ROTATE_OLD_KEY;
  const newSecret = process.env.BYOK_ROTATE_NEW_KEY;
  if (!oldSecret || !newSecret) {
    console.error("Set BYOK_ROTATE_OLD_KEY and BYOK_ROTATE_NEW_KEY before rotating.",);
    return 1;
  }

  const apply = args.includes("--apply",);
  const database = getDatabase(process.env.LOOP_LORE_DB_PATH || undefined,);

  let result: RotationResult;
  try {
    if (apply) {
      result = await rotateByokSecrets({ database, oldSecret, newSecret, },);
    } else {
      let preview: RotationResult | undefined;
      try {
        await database.transaction().execute(async (trx,) => {
          preview = await rotateByokSecrets({ database: trx, oldSecret, newSecret, },);
          throw new DryRunRollback();
        },);
      } catch (error) {
        if (!(error instanceof DryRunRollback)) { throw error; }
      }
      result = preview!;
    }
  } finally {
    await database.destroy();
  }

  report(result,);
  return result.failures.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await main(),);
}

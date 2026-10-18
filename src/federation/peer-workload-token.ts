// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-workload-token.ts — the same-host workload token.
//
// Stored encrypted with `encryptValue` under the BYOK store's server secret;
// read back only to present as a bearer credential, or to verify one. The
// plaintext never leaves this module and is never logged.

import type { Kysely, } from "kysely";
import { createHash, timingSafeEqual, } from "node:crypto";
import { decryptValue, } from "../crypto/byok";
import type { DB, } from "../db/schema";

/**
 * Decrypt a peer's stored workload token for the outbound bearer credential.
 * Returns null when the peer has none — callers MUST fail closed.
 * @param database
 * @param options
 * @param options.origin
 * @param options.encryptionKey
 * @returns {Promise<string | null>}
 */
export async function readPeerWorkloadToken(
  database: Kysely<DB>,
  options: { origin: string; encryptionKey: string },
): Promise<string | null> {
  const row = await database
    .selectFrom("mesh_peers",)
    .select("shared_token_enc",)
    .where("origin", "=", options.origin,)
    .executeTakeFirst();

  if (row?.shared_token_enc == null) { return null; }
  return decryptValue(row.shared_token_enc, options.encryptionKey,);
}

/**
 * @param value
 * @returns {Buffer}
 */
function digest(value: string,): Buffer {
  return createHash("sha256",).update(value, "utf8",).digest();
}

/**
 * Constant-time comparison of a presented bearer token against the stored one.
 * A truncated or whitespace-padded token fails: the stored value is trimmed
 * at save time and compared byte for byte.
 * @param database
 * @param options
 * @param options.origin
 * @param options.presented Bearer value from the wire, if any.
 * @param options.encryptionKey
 * @returns {Promise<boolean>}
 */
export async function verifyPeerWorkloadToken(
  database: Kysely<DB>,
  options: { origin: string; presented: string | null | undefined; encryptionKey: string },
): Promise<boolean> {
  const stored = await readPeerWorkloadToken(database, options,);
  if (stored === null || typeof options.presented !== "string" || options.presented === "") {
    return false;
  }

  return timingSafeEqual(digest(stored,), digest(options.presented,),);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/lookup.ts — shared world existence probe.
 *
 * Every domain that must answer "does this world exist?" before writing
 * reads the same single-column row. Sharing the query keeps the projection
 * (`id`) identical across domains, so a caller cannot branch on a column the
 * others never load.
 *
 * Lives here, not in `src/db/`: `src/db/` owns the connection and the test
 * override, and services must not import DB-specific modules. Both callers
 * are services holding their own `Kysely<DB>` handle, and `src/worlds/` is
 * the domain they already share.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";

/**
 * Load a world by id, or `undefined` when no such world exists.
 * @param db — Kysely handle typed against the generated schema.
 * @param worldId — the world to look up.
 * @returns The world row (`{ id }`), or `undefined` when absent.
 */
export function findWorld(db: Kysely<DB>, worldId: string,) {
  return db
    .selectFrom("worlds",)
    .select("id",)
    .where("id", "=", worldId,)
    .executeTakeFirst();
}

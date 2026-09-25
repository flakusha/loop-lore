// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * In-memory test helper — wraps the project's `createTestDb` (which
 * applies the full migration chain) and exposes the raw sqlite handle
 * for PRAGMA-level / introspection checks. The agency migrations
 * (009, 010, 011) are part of the migration chain.
 */

import type { Database } from "bun:sqlite";
import type { Kysely } from "kysely";
import { createTestDb } from "../../../test-utils/create-test-db";
import type { DB } from "../../../db";

export async function createInMemoryDb(): Promise<{ db: Kysely<DB>; raw: Database; }> {
  const { db, sqlite } = await createTestDb();
  return { db, raw: sqlite };
}

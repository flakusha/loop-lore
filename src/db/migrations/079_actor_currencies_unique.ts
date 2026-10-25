// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 079_actor_currencies_unique
 *
 * `idx_actor_currencies_actor_world` (001_init) is a plain non-unique index
 * on (actor_id, world_id), and `ensureBalanceRow`
 * (src/services/trade/balance.ts) is SELECT-then-INSERT with no constraint
 * covering currency_type — two concurrent ensures for the same
 * (actor, world, currency) both pass the lookup and both insert a ledger
 * row (BUG-service-layer-multi-query-mutations, ensureBalanceRow leg).
 *
 * Adds `uq_actor_currencies_actor_world_currency` (UNIQUE on all three
 * columns) and switches ensureBalanceRow to ON CONFLICT DO NOTHING +
 * re-read in the same change, so a raced pair becomes one insert plus one
 * no-op instead of two rows. The plain (actor_id, world_id) index is kept —
 * it is not redundant with the three-column unique index.
 *
 * Defensive dedupe before the UNIQUE index is built (078/030 convention):
 * a live database that already ran the racing insert path holds duplicate
 * ledger groups, and CREATE UNIQUE INDEX aborts on them, leaving the
 * migration chain stuck. Duplicate balance rows are always equivalent
 * (every writer updates the whole group to one value — credit/debit key on
 * actor+world+currency, not id), so the newest row survives and the rest
 * are dropped with a warning.
 */
import { type Kysely, sql, } from "kysely";

interface DupRow {
  actor_id: string;
  world_id: string;
  currency_type: string;
  n: number;
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  const dups = await sql<DupRow>`
    SELECT actor_id, world_id, currency_type, COUNT(*) AS n
    FROM actor_currencies
    GROUP BY actor_id, world_id, currency_type
    HAVING COUNT(*) > 1
  `.execute(database,);

  for (const dup of dups.rows) {
    process.emitWarning(
      `[079_actor_currencies_unique] actor ${dup.actor_id} has ${dup.n} rows for ${dup.currency_type} in world ${dup.world_id}; collapsing to newest.`,
    );

    await sql`
      DELETE FROM actor_currencies
      WHERE actor_id = ${dup.actor_id}
        AND world_id = ${dup.world_id}
        AND currency_type = ${dup.currency_type}
        AND rowid NOT IN (
          SELECT rowid FROM actor_currencies
          WHERE actor_id = ${dup.actor_id}
            AND world_id = ${dup.world_id}
            AND currency_type = ${dup.currency_type}
          ORDER BY rowid DESC
          LIMIT 1
        )
    `.execute(database,);
  }

  await sql`
    CREATE UNIQUE INDEX uq_actor_currencies_actor_world_currency
    ON actor_currencies (actor_id, world_id, currency_type)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS uq_actor_currencies_actor_world_currency
  `.execute(database,);
}

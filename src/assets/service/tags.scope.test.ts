// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * scopeOwnerPredicate tests — global rows visible to all, user rows only
 * to their owner, via both the defining module and its re-export.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetTagScope, AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { scopeOwnerPredicate as scopeOwnerPredicateViaTags, } from "./tags";
import { scopeOwnerPredicate, } from "./tags-query";

let fixture: TestDb | undefined;
let db: Kysely<DB>;

async function seed(): Promise<{ viewerId: string; otherId: string }> {
  fixture = await createTestDb();
  db = fixture.db;
  const viewerId = await insertUsers(db, "scope-viewer", "Scope Viewer",);
  const otherId = await insertUsers(db, "scope-other", "Scope Other",);
  const assetId = await insertAssets(
    db,
    viewerId,
    "scoped.png",
    "image/png",
    AssetType.Image,
    8,
    "/scoped.png",
  );

  const rows = [
    { tag: "global-tag", scope: AssetTagScope.Global, owner_id: null, },
    { tag: "mine-tag", scope: AssetTagScope.User, owner_id: viewerId, },
    { tag: "theirs-tag", scope: AssetTagScope.User, owner_id: otherId, },
  ];

  for (const row of rows) {
    await db.insertInto("asset_tags",).values({
      id: crypto.randomUUID(),
      asset_id: assetId,
      tag: row.tag,
      scope: row.scope,
      owner_id: row.owner_id,
      source: "manual",
    },).execute();
  }

  return { viewerId, otherId, };
}

async function teardown(): Promise<void> {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
}

describe("scopeOwnerPredicate", () => {
  test("viewer sees global rows plus their own user rows", async () => {
    const { viewerId, } = await seed();
    try {
      for (const predicate of [scopeOwnerPredicate, scopeOwnerPredicateViaTags,]) {
        const rows = await db
          .selectFrom("asset_tags",)
          .select("tag",)
          .where(predicate(viewerId,),)
          .orderBy("tag",)
          .execute();

        expect(rows.map((r,) => r.tag),).toEqual(["global-tag", "mine-tag",],);
      }
    } finally {
      await teardown();
    }
  });

  test("logged-out viewer sees global rows only", async () => {
    await seed();
    try {
      const rows = await db
        .selectFrom("asset_tags",)
        .select("tag",)
        .where(scopeOwnerPredicate(null,),)
        .execute();

      expect(rows.map((r,) => r.tag),).toEqual(["global-tag",],);
    } finally {
      await teardown();
    }
  });
});

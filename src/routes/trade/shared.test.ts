// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trust-boundary tests for the shared trade-world access guard.
 *
 * Actor ownership is not world access: a trade route must refuse an
 * otherwise-authenticated caller who cannot see the world. Each test owns an
 * in-memory DB, torn down in afterEach.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { WorldVisibility, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { TradeService, } from "../../services/trade";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { TradeRoutesOptions, } from "./shared";
import { requireTradeWorldAccess, } from "./shared";

describe("requireTradeWorldAccess", () => {
  let db: Kysely<DB>;
  let opts: TradeRoutesOptions;
  let ownerId: string;
  let otherId: string;
  let privateWorldId: string;
  let publicWorldId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    opts = { database: db, svc: () => new TradeService(db,), };

    ownerId = uid();
    otherId = uid();
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, role: "user", },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, role: "user", },);
    // world_members.actor_id references actors(id); the guard compares it
    // against the caller id, so both users need an actor row with that id.
    await insertActors(db, "Owner", { id: ownerId, },);
    await insertActors(db, "Other", { id: otherId, },);

    privateWorldId = await insertWorlds(db, ownerId, "Private Hold", {
      visibility: WorldVisibility.Private,
    },);

    publicWorldId = await insertWorlds(db, ownerId, "Public Square", {
      visibility: WorldVisibility.Public,
    },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("admits the world owner", async () => {
    expect(await requireTradeWorldAccess(opts, privateWorldId, ownerId, "user",),).toBeNull();
  });

  test("admits an admin on a world they do not own", async () => {
    expect(await requireTradeWorldAccess(opts, privateWorldId, otherId, "admin",),).toBeNull();
  });

  test("admits an authenticated counterparty on a public world", async () => {
    expect(await requireTradeWorldAccess(opts, publicWorldId, otherId, "user",),).toBeNull();
  });

  test("admits a world member on a private world", async () => {
    await insertWorldMembers(db, privateWorldId, otherId,);

    expect(await requireTradeWorldAccess(opts, privateWorldId, otherId, "user",),).toBeNull();
  });

  test("denies an authenticated non-member on a private world", async () => {
    const res = await requireTradeWorldAccess(opts, privateWorldId, otherId, "user",);

    expect(res,).not.toBeNull();
    expect(res!.status,).toBe(404,);
  });

  test("denies a wrong (nonexistent) world id", async () => {
    const res = await requireTradeWorldAccess(opts, uid(), ownerId, "user",);

    expect(res,).not.toBeNull();
    expect(res!.status,).toBe(404,);
  });
});

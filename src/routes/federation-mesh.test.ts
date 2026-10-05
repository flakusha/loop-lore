// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `/api/mesh-retract`.
 *
 * The retract handler authorizes against a SELECT of `mesh_deliveries.origin`
 * and then deletes. The delete must be scoped to that same authorized origin:
 * `receiveDelivery` upserts `mesh_deliveries` on `content_id` with an LWW
 * `doUpdateSet` that overwrites `origin`, so a content_id can be rebound to a
 * different trusted peer between the read and the write. An unscoped DELETE
 * lets one peer delete another peer's delivery (IDOR).
 */
import type { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { Config, FederationConfig, } from "../config/schema";
import type { Db, } from "../db";
import { createSqliteDialect, } from "../db";
import type { DB, } from "../db/schema";
import { upsertPeer, } from "../federation/coordinator";
import { createTestDb, } from "../test-utils/create-test-db";
import { federationRoutes, } from "./federation";

const PEER_A = "https://a.example";
const PEER_B = "https://b.example";

/** @param federation */
function configWith(federation: Partial<FederationConfig>,): Config {
  const fed: FederationConfig = {
    enabled: federation.enabled ?? true,
    seeds: federation.seeds ?? [],
    peers: federation.peers ?? [],
    meshPsk: federation.meshPsk ?? "",
    duplication: federation.duplication ?? { mode: "trusted", peers: [], },
  };

  return {
    server: { host: "localhost", port: 3000, tls: undefined, },
    auth: { registrationOpen: false, },
    federation: fed,
  } as unknown as Config;
}

/**
 * A database handle that rebinds `contentId` to `newOrigin` as the handler's
 * DELETE is compiled — i.e. inside the read-then-write window between the authz
 * SELECT and the write.
 *
 * This is the shape of a real race: `receiveDelivery` upserts on `content_id`
 * with an LWW `doUpdateSet` that overwrites `origin`, so a second peer can take
 * over a content id after the retracting peer passed authorization. The authz
 * SELECT still reads the pre-race row, exactly as in production; only the DELETE
 * can be relied on to refuse.
 * @param sqlite Raw handle the test DB already owns.
 * @param contentId
 * @param newOrigin
 * @param onDelete Invoked once the rebind has landed, for assertions.
 * @returns A `Db` the route can use in place of the plain test handle.
 */
function dbWithOriginRebind(
  sqlite: Database,
  contentId: string,
  newOrigin: string,
  onDelete: () => void,
): Db {
  return new Kysely<DB>({
    dialect: createSqliteDialect(sqlite,),
    plugins: [
      {
        transformQuery: ({ node, },) => {
          if (node.kind === "DeleteQueryNode") {
            sqlite.run("UPDATE mesh_deliveries SET origin = ? WHERE content_id = ?", [newOrigin, contentId,],);
            onDelete();
          }

          return node;
        },
        transformResult: async ({ result, },) => await result,
      },
    ],
  },) as Db;
}

describe("mesh-retract", () => {
  /**
   * @param db
   * @param contentId
   * @param origin Stored origin string, verbatim (not canonicalized).
   */
  async function seedDelivery(db: Db, contentId: string, origin: string,): Promise<void> {
    await db
      .insertInto("mesh_deliveries",)
      .values({ content_id: contentId, origin, content_hash: "hash-1", clock: 1, },)
      .execute();
  }

  /** @param db @param contentId */
  async function originOf(db: Db, contentId: string,): Promise<string | undefined> {
    const row = await db
      .selectFrom("mesh_deliveries",)
      .select(["origin",],)
      .where("content_id", "=", contentId,)
      .executeTakeFirst();

    return row?.origin;
  }

  /**
   * @param db
   * @param body
   */
  async function retract(db: Db, body: unknown,): Promise<Response> {
    const app = federationRoutes({ config: configWith({ enabled: true, },), database: db, },);
    return app.handle(
      new Request("http://localhost/api/mesh-retract", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
  }

  test("origin mismatched trusted peer cannot delete another peer's delivery", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await upsertPeer(db, { origin: PEER_B, state: "trusted", },);
    await seedDelivery(db, "shared-content", PEER_A,);

    const res = await retract(db, { contentId: "shared-content", origin: PEER_B, },);

    expect(res.status,).toBe(403,);
    expect(await originOf(db, "shared-content",),).toBe(PEER_A,);
  });

  test("originating peer retracts its own delivery", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await seedDelivery(db, "own-content", PEER_A,);

    const res = await retract(db, { contentId: "own-content", origin: PEER_A, },);

    expect(res.status,).toBe(200,);
    expect(await originOf(db, "own-content",),).toBeUndefined();
  });

  test("an untrusted peer claiming the owning origin is rejected", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await upsertPeer(db, { origin: PEER_B, state: "pending", },);
    await seedDelivery(db, "pending-content", PEER_A,);

    const res = await retract(db, { contentId: "pending-content", origin: PEER_B, },);

    expect(res.status,).toBe(403,);
    expect(await originOf(db, "pending-content",),).toBe(PEER_A,);
  });

  test("retract of unknown content is 404 and leaves other rows alone", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await seedDelivery(db, "kept-content", PEER_A,);

    const res = await retract(db, { contentId: "missing-content", origin: PEER_A, },);

    expect(res.status,).toBe(404,);
    expect(await originOf(db, "kept-content",),).toBe(PEER_A,);
  });

  test("an origin rebound between the authz read and the delete is not deleted", async () => {
    // A is the legitimate owner and passes the authz SELECT. B races a
    // `receiveDelivery` upsert that rebinds the content id to itself before the
    // write lands. An unscoped DELETE would destroy B's row and answer 200;
    // only an origin-scoped predicate refuses.
    const { db, sqlite, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await upsertPeer(db, { origin: PEER_B, state: "trusted", },);
    await seedDelivery(db, "rebound-content", PEER_A,);

    let rebindLanded = false;
    const racingDb = dbWithOriginRebind(sqlite, "rebound-content", PEER_B, () => {
      rebindLanded = true;
    },);

    const app = federationRoutes({ config: configWith({ enabled: true, },), database: racingDb, },);
    const res = await app.handle(
      new Request("http://localhost/api/mesh-retract", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ contentId: "rebound-content", origin: PEER_A, },),
      },),
    );

    expect(rebindLanded,).toBe(true,);
    expect(res.status,).toBe(403,);
    expect(await originOf(db, "rebound-content",),).toBe(PEER_B,);
  });

  test("a path-bearing stored origin still retracts for its canonical owner", async () => {
    // The DELETE predicate compares the stored origin against itself, so it is
    // unaffected by how the caller spells the origin. Guards against someone
    // "fixing" a mismatch by switching the predicate to the canonical value.
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await seedDelivery(db, "path-content", `${PEER_A}/some/path`,);

    const res = await retract(db, { contentId: "path-content", origin: PEER_A, },);

    expect(res.status,).toBe(200,);
    expect(await originOf(db, "path-content",),).toBeUndefined();
  });

  test("a rebind cannot let a non-owner through the authz check", async () => {
    // The mirror of the race above: B is the caller, A owns the row. B must be
    // refused by the pre-DELETE check, before any DELETE is even compiled.
    const { db, sqlite, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await upsertPeer(db, { origin: PEER_B, state: "trusted", },);
    await seedDelivery(db, "nonowner-content", PEER_A,);

    let deleteCompiled = false;
    const racingDb = dbWithOriginRebind(sqlite, "nonowner-content", PEER_B, () => {
      deleteCompiled = true;
    },);

    const app = federationRoutes({ config: configWith({ enabled: true, },), database: racingDb, },);
    const res = await app.handle(
      new Request("http://localhost/api/mesh-retract", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ contentId: "nonowner-content", origin: PEER_B, },),
      },),
    );

    expect(res.status,).toBe(403,);
    expect(deleteCompiled,).toBe(false,);
    expect(await originOf(db, "nonowner-content",),).toBe(PEER_A,);
  });

  test("a non-canonical spelling of the owning origin still retracts", async () => {
    // The stored origin scopes the DELETE, so a trailing-slash spelling from
    // the caller canonicalizes for the authz check without breaking the write.
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
    await seedDelivery(db, "slash-content", PEER_A,);

    const res = await retract(db, { contentId: "slash-content", origin: `${PEER_A}/`, },);

    expect(res.status,).toBe(200,);
    expect(await originOf(db, "slash-content",),).toBeUndefined();
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: the trust-boundary fixes landed on this branch.
 *
 * Every case drives the REAL server over HTTP and then reads the database
 * directly for the state the fix is about. Nothing here asserts a mock: if the
 * route did not exist, or the guard did not hold, the assertion on the row
 * would fail.
 *
 * (f) — a generation tool call writing into a world the caller cannot access —
 * has no e2e spec on purpose: after the fix `worldId` is no longer part of the
 * tools' PARAMETERS, so no HTTP sequence can produce the offending argument,
 * and the tool only ever runs from inside an LLM turn. It is covered at
 * src/generation/tools/create-item.test.ts, which drives the handler with the
 * exact tool-call shape a model emits.
 */

import { GatheringNodeType, NodeInstanceState, PublicationStatus, } from "@/db/enums";
import { WorldVisibility, } from "@/db/enums-story";
import { ResourceQuality, } from "@/db/enums-story/resources";
import {
  insertActors,
  insertGatheringNodeDefs,
  insertGatheringNodeInstances,
  insertLocations,
  insertLocationStorage,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "@/test-utils/insert-helpers";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedChat, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

/** bcrypt cost 4 hash of "password" — the hash the seed helper uses. */
const PASSWORD_HASH = "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG";

/** Hex-only ids: several routes validate `:id` against [a-f0-9-]+. */
const MEMBER = "b0000001-0000-4000-a000-000000000001";
const RIVAL = "b0000002-0000-4000-a000-000000000002";
const THIRD = "b0000003-0000-4000-a000-000000000003";
// A user's own actor shares its id, the convention the rest of the e2e suite
// uses (see invite-join.test.ts); the redeem path resolves it that way.
const MEMBER_ACTOR = MEMBER;
const RIVAL_ACTOR = RIVAL;
const THIRD_ACTOR = THIRD;

const RIVAL_WORLD = "b0000020-0000-4000-a000-000000000020";
const OWN_LOCATION = "b0000031-0000-4000-a000-000000000031";
const RIVAL_LOCATION = "b0000032-0000-4000-a000-000000000032";
const OWN_NODE = "b0000041-0000-4000-a000-000000000041";
const RIVAL_NODE = "b0000042-0000-4000-a000-000000000042";
const OWN_STORAGE = "b0000051-0000-4000-a000-000000000051";
const RIVAL_STORAGE = "b0000052-0000-4000-a000-000000000052";
const OWN_FACTION = "b0000061-0000-4000-a000-000000000061";
const RIVAL_FACTION = "b0000062-0000-4000-a000-000000000062";
const JOIN_CHAT = SEED.chat.id;

/** Well before any respawn window these fixtures could open. */
const STAMP = "2026-03-01T00:00:00.000Z";

describe("World trust-boundary fixes E2E", () => {
  let server: TestServer;
  let owner: ApiClient;
  let member: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    await seedUsers(server.db,);

    // A member of the owner's world (not the owner), plus two outsiders who
    // belong to no world we touch.
    const accounts: Array<[string, string, string,]> = [
      [MEMBER, "e2emember", MEMBER_ACTOR,],
      [RIVAL, "e2erival", RIVAL_ACTOR,],
      [THIRD, "e2ethird", THIRD_ACTOR,],
    ];

    for (const [id, username, actorId,] of accounts) {
      await insertUsers(server.db, username, username, {
        id,
        secret_hash: PASSWORD_HASH,
        role: "user",
        status: "active",
      },);

      // Mirror the actor shape invite-join.test.ts uses: the redeem path resolves
      // the caller by user_id and needs a real user-type actor to exist.
      await insertActors(server.db, username, {
        id: actorId,
        actor_type: "user",
        user_id: id,
        owner_id: id,
        agent_type: "none",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        row_version: 0,
      },);
    }

    await seedWorlds();
    await insertWorldMembers(server.db, SEED.world.id, MEMBER_ACTOR,);

    owner = createClient(server.url,);
    await owner.loginAs(SEED.user.username, SEED.user.password,);
    member = createClient(server.url,);
    await member.loginAs("e2emember", "password",);
  },);

  afterAll(async () => {
    await server.close();
  },);

  /** Two worlds, a location and a depleted node in each, plus storage + factions. */
  async function seedWorlds(): Promise<void> {
    await insertWorlds(server.db, SEED.user.id, SEED.world.name, {
      id: SEED.world.id,
      // Public so the non-owner `member` client passes requireWorldAccess; these
      // specs are about world SCOPING of the rows, not about membership lookup.
      visibility: WorldVisibility.Public,
      publication_status: PublicationStatus.Published,
    },);

    // A world owned by a completely different user, so nothing about it is
    // reachable by our owner.
    await insertWorlds(server.db, RIVAL, "Rival World", {
      id: RIVAL_WORLD,
      publication_status: PublicationStatus.Published,
    },);

    await insertLocations(server.db, SEED.world.id, "Mine", { id: OWN_LOCATION, },);
    await insertLocations(server.db, RIVAL_WORLD, "Quarry", { id: RIVAL_LOCATION, },);

    const nodes: Array<[string, string, string,]> = [
      [SEED.world.id, OWN_LOCATION, OWN_NODE,],
      [RIVAL_WORLD, RIVAL_LOCATION, RIVAL_NODE,],
    ];

    for (const [worldId, locationId, nodeId,] of nodes) {
      const defId = await insertGatheringNodeDefs(
        server.db,
        worldId,
        "Iron Vein",
        GatheringNodeType.OreVein,
        STAMP,
        STAMP,
        { respawn_time_seconds: 1, },
      );

      await insertGatheringNodeInstances(server.db, defId, worldId, 1, STAMP, STAMP, {
        id: nodeId,
        location_id: locationId,
        state: NodeInstanceState.Depleted,
        respawn_at: STAMP,
        quality: ResourceQuality.Common,
        extraction_difficulty: 50,
        remaining_amount: 0,
      },);
    }

    await insertLocationStorage(server.db, SEED.world.id, OWN_LOCATION, "Own Chest", { id: OWN_STORAGE, },);
    await insertLocationStorage(server.db, RIVAL_WORLD, RIVAL_LOCATION, "Rival Chest", { id: RIVAL_STORAGE, },);

    const factions: Array<[string, string, string,]> = [
      [SEED.world.id, OWN_FACTION, "Order of the Mine",],
      [RIVAL_WORLD, RIVAL_FACTION, "Rival Guild",],
    ];

    for (const [worldId, factionId, name,] of factions) {
      await server.db
        .insertInto("factions",)
        .values({ id: factionId, world_id: worldId, name, },)
        .execute();
    }
  }

  /** The stored state of one seeded node. */
  async function nodeState(nodeId: string,): Promise<string> {
    const row = await server.db
      .selectFrom("gathering_node_instances",)
      .select(["state",],)
      .where("id", "=", nodeId,)
      .executeTakeFirstOrThrow();

    return row.state;
  }

  // ── regenerate is owner-gated and world-scoped ──────────────────────────

  test("a member who does not own the world is refused by regenerate", async () => {
    const res = await member.post(`/api/v1/worlds/${SEED.world.id}/resources/regenerate`, {},);

    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(403,);
  });

  test("the owner's regenerate restores its own world and leaves the rival world's node depleted", async () => {
    expect(await nodeState(OWN_NODE,),).toBe(NodeInstanceState.Depleted,);
    expect(await nodeState(RIVAL_NODE,),).toBe(NodeInstanceState.Depleted,);

    const res = await owner.post<{ data: { regenerated: number } }>(
      `/api/v1/worlds/${SEED.world.id}/resources/regenerate`,
      {},
    );

    expect(res.ok,).toBe(true,);
    expect(res.data!.data.regenerated,).toBe(1,);
    expect(await nodeState(OWN_NODE,),).toBe(NodeInstanceState.Available,);
    // The load-bearing assertion: an unscoped UPDATE would have flipped this too.
    expect(await nodeState(RIVAL_NODE,),).toBe(NodeInstanceState.Depleted,);
  });

  // ── container usage is world-scoped ─────────────────────────────────────

  test("a container in another world reads as 404, the world's own reads 200", async () => {
    const own = await member.get(`/api/v1/worlds/${SEED.world.id}/storage/${OWN_STORAGE}`,);
    expect({ ok: own.ok, status: own.status, error: own.error, },).toEqual({ ok: true, status: 200, error: null, },);

    const foreign = await member.get(`/api/v1/worlds/${SEED.world.id}/storage/${RIVAL_STORAGE}`,);
    expect(foreign.ok,).toBe(false,);
    expect(foreign.status,).toBe(404,);
  });

  // ── faction standing is world-scoped ────────────────────────────────────

  test("POST standing for another world's faction is 404 and writes no row", async () => {
    const res = await owner.post(
      `/api/v1/worlds/${SEED.world.id}/actors/${MEMBER_ACTOR}/factions/${RIVAL_FACTION}/standing`,
      { delta: 25, reason: "e2e cross-world write", },
    );

    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(404,);

    const rows = await server.db
      .selectFrom("faction_standing",)
      .selectAll()
      .where("faction_id", "=", RIVAL_FACTION,)
      .execute();

    expect(rows.length,).toBe(0,);
  });

  test("GET standing for another world's faction is 404", async () => {
    const res = await member.get(
      `/api/v1/worlds/${SEED.world.id}/actors/${MEMBER_ACTOR}/factions/${RIVAL_FACTION}/standing`,
    );

    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(404,);
  });

  test("GET standing for the world's own faction still works", async () => {
    // The GET reads an existing standing row, so establish one the legitimate
    // way first: the owner writes standing for a faction IN the world.
    const write = await owner.post(
      `/api/v1/worlds/${SEED.world.id}/actors/${MEMBER_ACTOR}/factions/${OWN_FACTION}/standing`,
      { delta: 10, reason: "e2e own-world standing", },
    );

    expect(write.ok,).toBe(true,);

    const res = await member.get(
      `/api/v1/worlds/${SEED.world.id}/actors/${MEMBER_ACTOR}/factions/${OWN_FACTION}/standing`,
    );

    expect(res.ok,).toBe(true,);
    expect(res.status,).toBe(200,);
  });

  // ── abilityBonus is bounded at the trust boundary ───────────────────────

  test("an abilityBonus beyond the accepted range is rejected by validation", async () => {
    const res = await owner.post(`/api/v1/worlds/${SEED.world.id}/resources/extract`, {
      locationId: OWN_LOCATION,
      nodeInstanceId: OWN_NODE,
      abilityBonus: 9999,
    },);

    expect(res.ok,).toBe(false,);
    expect([400, 415, 422,],).toContain(res.status,);
  });

  // ── invite redemption cannot oversell max_uses ──────────────────────────

  test("two concurrent redemptions of a max_uses = 1 invite admit exactly one", async () => {
    await seedChat(server.db,);

    const created = await owner.post<{ code: string }>(
      `/api/v1/chats/${JOIN_CHAT}/invites`,
      { maxUses: 1, },
    );

    expect(created.ok,).toBe(true,);
    const code = created.data!.code;

    const rival = createClient(server.url,);
    await rival.loginAs("e2erival", "password",);
    const third = createClient(server.url,);
    await third.loginAs("e2ethird", "password",);

    // Genuinely concurrent: both requests are in flight before either returns.
    const [a, b,] = await Promise.all([
      rival.post(`/api/v1/invites/${code}/join`, {},),
      third.post(`/api/v1/invites/${code}/join`, {},),
    ],);

    const participants = await server.db
      .selectFrom("chat_participants",)
      .select(["actor_id",],)
      .where("chat_id", "=", JOIN_CHAT,)
      .execute();

    const joined = participants.filter(
      (p,) => p.actor_id === RIVAL_ACTOR || p.actor_id === THIRD_ACTOR,
    );

    const row = await server.db
      .selectFrom("chat_invites",)
      .select(["uses", "status",],)
      .where("code", "=", code,)
      .executeTakeFirstOrThrow();

    // Exactly one winner (200), the loser 410 Gone, one participant row, and the
    // invite flipped to `exhausted`. WHICH of the two wins is a race, so the
    // assertion is on the multiset of statuses, not on a or b individually.
    expect({
      joined: joined.length,
      uses: row.uses,
      status: row.status,
      statuses: [a.status, b.status,].sort(),
    },).toEqual({
      joined: 1,
      uses: 1,
      status: "exhausted",
      statuses: [200, 410,],
    },);
  });
});

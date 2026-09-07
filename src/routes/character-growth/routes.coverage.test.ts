// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for character-growth routes (arc read + growth-log read)
 * plus the colocated request helpers (error mapping + param guards).
 *
 * PATCH /arc and the confirm/reject endpoints declare params schemas the
 * route paths cannot satisfy, so Elysia rejects them with 422 before the
 * handlers run; those cases pin the current behavior.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { GrowthServiceError, } from "../../characters/services/growth-service/types";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertCharacterArc, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { errResponse, getBoolean, getNumber, getString, } from "./helpers";
import { characterGrowthRoutes, } from "./index";

interface ArcBody {
  arc: { actorId: string; currentStage: string; stageDescription: string | null } | null;
  growthMode: string;
  llmAssistEnabled: boolean;
}

interface LogBody {
  entries: Array<{ id: string; status: string; axis: string }>;
}

describe("characterGrowthRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  const actorId = uid();
  const now = new Date().toISOString();

  /**
   * Build the route app with the given auth context.
   * @param userId authenticated user or null for anonymous
   */
  function makeApp(userId: string | null,): Elysia {
    return new Elysia({ name: `test-growth-${userId ?? "anon"}`, },)
      .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
      .use(characterGrowthRoutes({ database: db, },),) as unknown as Elysia;
  }

  let app: Elysia;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    const stamp = Date.now().toString(36,);
    await db.insertInto("users",).values({
      id: owner,
      username: `growth-owner-${stamp}`,
      display_name: "Growth Owner",
      password_hash: "h",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("users",).values({
      id: stranger,
      username: `growth-stranger-${stamp}`,
      display_name: "Growth Stranger",
      password_hash: "h",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("actors",).values({
      id: actorId,
      actor_type: "character",
      display_name: "Growth Character",
      user_id: owner,
      owner_id: owner,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();
    await db.insertInto("growth_log",).values({
      id: uid(),
      actor_id: actorId,
      axis: "trait",
      event_type: "trait_drifted",
      status: "applied",
      reason: "coverage",
      recorded_at: now,
    },).execute();
    await db.insertInto("growth_log",).values({
      id: uid(),
      actor_id: actorId,
      axis: "skill",
      event_type: "skill_acquired",
      status: "pending",
      reason: "coverage",
      recorded_at: now,
    },).execute();
    app = makeApp(owner,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("GET arc requires auth and a known, owned actor", async () => {
    const anon = await makeApp(null,).handle(
      new Request(`http://localhost/api/character-growth/arc?actorId=${actorId}`,),
    );
    expect(anon.status,).toBe(401,);
    const empty = await app.handle(new Request("http://localhost/api/character-growth/arc?actorId=",),);
    expect(empty.status,).toBe(400,);
    const missing = await app.handle(new Request("http://localhost/api/character-growth/arc",),);
    expect(missing.status,).toBe(422,);
    const unknown = await app.handle(
      new Request(`http://localhost/api/character-growth/arc?actorId=${uid()}`,),
    );
    expect(unknown.status,).toBe(404,);
    const outsider = await makeApp(stranger,).handle(
      new Request(`http://localhost/api/character-growth/arc?actorId=${actorId}`,),
    );
    expect(outsider.status,).toBe(404,);
  },);

  test("GET arc returns null arc plus growth mode before authoring", async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/character-growth/arc?actorId=${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as ArcBody;
    expect(body.arc,).toBeNull();
    expect(body.growthMode,).toBe("dynamic",);
    expect(typeof body.llmAssistEnabled,).toBe("boolean",);
  },);

  test("GET arc reflects a stored arc stage", async () => {
    await insertCharacterArc(db, actorId, "crisis", new Date().toISOString(), {
      stage_description: "low point",
    },);
    const res = await app.handle(
      new Request(`http://localhost/api/character-growth/arc?actorId=${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as ArcBody;
    expect(body.arc?.currentStage,).toBe("crisis",);
    expect(body.arc?.stageDescription,).toBe("low point",);
  },);

  test("GET growth-log defaults to applied entries with filters", async () => {
    const base = `http://localhost/api/character-growth/growth-log?actorId=${actorId}`;
    const anon = await makeApp(null,).handle(new Request(base,),);
    expect(anon.status,).toBe(401,);
    const empty = await app.handle(
      new Request("http://localhost/api/character-growth/growth-log?actorId=",),
    );
    expect(empty.status,).toBe(400,);
    const unknown = await app.handle(
      new Request(`http://localhost/api/character-growth/growth-log?actorId=${uid()}`,),
    );
    expect(unknown.status,).toBe(404,);
    const def = (await (await app.handle(new Request(base,),)).json()) as LogBody;
    expect(def.entries.length,).toBe(1,);
    expect(def.entries.every((e,) => e.status === "applied",),).toBe(true,);
    const all = (await (await app.handle(
      new Request(`${base}&includePending=true`,),
    )).json()) as LogBody;
    expect(all.entries.length,).toBe(2,);
    const pending = (await (await app.handle(
      new Request(`${base}&includePending=true&status=pending`,),
    )).json()) as LogBody;
    expect(pending.entries.length,).toBe(1,);
    expect(pending.entries[0]?.axis,).toBe("skill",);
    const trait = (await (await app.handle(
      new Request(`${base}&includePending=true&axis=trait`,),
    )).json()) as LogBody;
    expect(trait.entries.length,).toBe(1,);
    const limited = (await (await app.handle(
      new Request(`${base}&includePending=true&limit=1`,),
    )).json()) as LogBody;
    expect(limited.entries.length,).toBe(1,);
    const badAxis = await app.handle(new Request(`${base}&axis=bogus`,),);
    expect(badAxis.status,).toBe(422,);
  },);

  test("PATCH arc and confirm/reject are rejected by param validation", async () => {
    const patch = await app.handle(new Request("http://localhost/api/character-growth/arc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ currentStage: "crisis", },),
    },),);
    expect(patch.status,).toBe(422,);
    const confirm = await app.handle(
      new Request(`http://localhost/api/character-growth/growth-log/${uid()}/confirm`, {
        method: "POST",
      },),
    );
    expect(confirm.status,).toBe(422,);
    const reject = await app.handle(
      new Request(`http://localhost/api/character-growth/growth-log/${uid()}/reject`, {
        method: "POST",
      },),
    );
    expect(reject.status,).toBe(422,);
  },);
});

describe("character-growth helpers", () => {
  test("errResponse maps service error codes to HTTP statuses", () => {
    expect(errResponse(new GrowthServiceError("x", "static_mode_forbidden",),).status,).toBe(409,);
    expect(errResponse(new GrowthServiceError("x", "integrity_forbidden",),).status,).toBe(409,);
    expect(errResponse(new GrowthServiceError("x", "not_found",),).status,).toBe(404,);
    expect(errResponse(new GrowthServiceError("x", "already_resolved",),).status,).toBe(409,);
    expect(errResponse(new GrowthServiceError("x", "invalid_input",),).status,).toBe(400,);
    expect(errResponse(new Error("boom",),).status,).toBe(500,);
    expect(errResponse("boom",).status,).toBe(500,);
  },);

  test("param guards reject nulls, non-objects, and mistyped values", () => {
    expect(getString(null, "a",),).toBeUndefined();
    expect(getString("nope", "a",),).toBeUndefined();
    expect(getString({ a: 1, }, "a",),).toBeUndefined();
    expect(getString({ a: "v", }, "a",),).toBe("v",);
    expect(getNumber(null, "a",),).toBeUndefined();
    expect(getNumber({ a: "1", }, "a",),).toBeUndefined();
    expect(getNumber({ a: 2, }, "a",),).toBe(2,);
    expect(getBoolean(null, "a",),).toBeUndefined();
    expect(getBoolean({ a: "true", }, "a",),).toBeUndefined();
    expect(getBoolean({ a: true, }, "a",),).toBe(true,);
  },);
});

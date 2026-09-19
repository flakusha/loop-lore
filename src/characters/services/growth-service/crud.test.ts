/**
 * Growth Service Arc + Confirm Tests
 *
 * Pins arc upsert/get lifecycle and pending entry resolution.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { createLogger, } from "../../../logger/index.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import { createTestActors, } from "../test-helpers.js";
import { getArc, upsertArc, } from "./crud-arc.js";
import { confirmGrowthEntry, rejectGrowthEntry, } from "./crud-confirm.js";
import { getGrowthMode, insertGrowthLog, listGrowthLog, } from "./crud-log.js";
import { CharacterGrowthService, characterGrowthService, } from "./index.js";
import { GrowthServiceError, } from "./types.js";

describe("growth-service arc + confirm", () => {
  let db: Kysely<DB>;
  let actorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    db = (await createTestDb()).db;
    ({ actorId, } = await createTestActors(db, "test-actor-growth-001",));
  },);

  it("returns null arc before authoring, then persists upserts", async () => {
    expect(await getArc(db, actorId,),).toBeNull();
    const arc = await upsertArc(db, { actorId, currentStage: "crisis", stageDescription: "low", }, "u1",);
    expect(arc.currentStage,).toBe("crisis",);
    expect((await getArc(db, actorId,))?.currentStage,).toBe("crisis",);
    await upsertArc(db, { actorId, currentStage: "resolution", }, "u1",);
    expect((await getArc(db, actorId,))?.currentStage,).toBe("resolution",);
  });

  it("confirms a pending entry and rejects double resolution", async () => {
    const entryId = "growth-entry-001";
    await db.insertInto("growth_log",).values({
      id: entryId,
      actor_id: actorId,
      axis: "trait",
      event_type: "trait_drifted",
      status: "pending",
      subject_kind: "trait",
      subject_id: "t1",
      recorded_at: new Date().toISOString(),
    },).execute();
    const confirmed = await confirmGrowthEntry(db, { entryId, actorId, confirmedBy: "u1", },);
    expect(confirmed.status,).toBe("applied",);
    await expect(rejectGrowthEntry(db, { entryId, actorId, rejectedBy: "u1", },),).rejects.toBeInstanceOf(
      GrowthServiceError,
    );
  });

  it("throws not_found for unknown entries", async () => {
    await expect(confirmGrowthEntry(db, { entryId: "nope", actorId, confirmedBy: "u1", },),)
      .rejects.toMatchObject({ code: "not_found", },);
  });
});

describe("growth-service insert/list", () => {
  let db: Kysely<DB>;
  let actorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    db = (await createTestDb()).db;
    ({ actorId, } = await createTestActors(db, "test-actor-growth-002",));
  },);

  it("defaults to dynamic mode and inserts applied entries", async () => {
    expect((await getGrowthMode(db, actorId,)).growthMode,).toBe("dynamic",);
    const entry = await insertGrowthLog(db, { actorId, axis: "trait", eventType: "trait_drifted", },);
    expect(entry.status,).toBe("applied",);
    expect(entry.confirmedAt,).not.toBeNull();
  });

  it("player view hides pending entries", async () => {
    await insertGrowthLog(db, { actorId, axis: "trait", eventType: "trait_drifted", status: "pending", },);
    expect((await listGrowthLog(db, actorId,)).every((e,) => e.status === "applied"),).toBe(true,);
    expect(await listGrowthLog(db, actorId, { includePending: true, status: "pending", },),).toHaveLength(1,);
    expect(await listGrowthLog(db, actorId, { axis: "trait", includePending: true, },),).toHaveLength(2,);
  });

  it("static mode refuses non-author events but allows arc stages", async () => {
    await db.updateTable("actors",).set({ growth_mode: "static", },).where("id", "=", actorId,).execute();
    await expect(insertGrowthLog(db, { actorId, axis: "trait", eventType: "trait_drifted", },),)
      .rejects.toMatchObject({ code: "static_mode_forbidden", },);
    const arc = await insertGrowthLog(db, { actorId, axis: "arc", eventType: "arc_stage_set", },);
    expect(arc.status,).toBe("applied",);
  });
});

describe("growth-service facade (index.ts)", () => {
  let db: Kysely<DB>;
  let actorId: string;
  let svc: CharacterGrowthService;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    db = (await createTestDb()).db;
    ({ actorId, } = await createTestActors(db, "test-actor-growth-003",));
    svc = characterGrowthService(db,);
  },);

  it("factory returns a facade instance", () => {
    expect(svc,).toBeInstanceOf(CharacterGrowthService,);
  });

  it("round-trips growth mode, arc, and log through the facade", async () => {
    expect((await svc.getGrowthMode(actorId,)).growthMode,).toBe("dynamic",);
    expect(await svc.getArc(actorId,),).toBeNull();
    const arc = await svc.upsertArc({ actorId, currentStage: "crisis", }, "u1",);
    expect(arc.currentStage,).toBe("crisis",);
    expect((await svc.getArc(actorId,))?.currentStage,).toBe("crisis",);
    const entry = await svc.insertGrowthLog({ actorId, axis: "trait", eventType: "trait_drifted", },);
    expect(entry.status,).toBe("applied",);
    expect((await svc.listGrowthLog(actorId,)).some((e,) => e.id === entry.id),).toBe(true,);
  });

  it("confirms and rejects pending entries through the facade", async () => {
    const pending = await svc.insertGrowthLog({
      actorId,
      axis: "trait",
      eventType: "trait_drifted",
      status: "pending",
    },);
    const confirmed = await svc.confirmGrowthEntry({ entryId: pending.id, actorId, confirmedBy: "u1", },);
    expect(confirmed.status,).toBe("applied",);
    const pending2 = await svc.insertGrowthLog({
      actorId,
      axis: "trait",
      eventType: "trait_drifted",
      status: "pending",
    },);
    const rejected = await svc.rejectGrowthEntry({ entryId: pending2.id, actorId, rejectedBy: "u1", },);
    expect(rejected.status,).toBe("rejected",);
  });
});

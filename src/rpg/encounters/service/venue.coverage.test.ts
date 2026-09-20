// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for encounter venue resolution.
 *
 * Exercises findEncounterLocation's meta parsing (missing row, invalid
 * meta, non-string location_id) and resolveAtmosphereBonus's tier
 * branches plus its fail-open catch path.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import type { getLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import { uid, } from "../../../utils.js";
import type { LocationNsfwService, } from "../../location-nsfw/service";
import { findEncounterLocation, resolveAtmosphereBonus, } from "./venue.js";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/** Insert an encounter_venue status_effect row for `encounterId`. */
async function insertVenue(encounterId: string, meta: string | null,): Promise<void> {
  const actorId = uid();
  const { insertActors, } = await import("../../../test-utils/insert-helpers.js");
  await insertActors(db, `venue-${actorId}`, { id: actorId, },);
  await db.insertInto("status_effect",).values({
    id: uid(),
    actor_id: actorId,
    effect_id: "encounter_venue",
    category: "venue",
    affected_stat: null,
    source: "encounter",
    source_id: encounterId,
    started_at: "2026-01-01T00:00:00.000Z",
    expires_at: null,
    meta,
  },).execute();
}

/** Locations stub whose atmosphere is scripted per test. */
function locationsStub(result: { romantic: number; dangerous: number } | Error,): LocationNsfwService {
  return {
    resolveAtmosphere: () => result instanceof Error ? Promise.reject(result,) : Promise.resolve(result,),
  } as unknown as LocationNsfwService;
}

/** Logger stub capturing warn calls (fail-open path asserts). */
function logStub(): ReturnType<typeof getLogger> & { warns: string[] } {
  const warns: string[] = [];
  const noop = (): void => undefined;
  const capture = (msg: string,): void => void warns.push(msg,);
  return {
    warns,
    warn: capture,
    trace: noop,
    debug: noop,
    info: noop,
    error: capture,
    fatal: noop,
    child: () => logStub(),
  } as unknown as ReturnType<typeof getLogger> & { warns: string[] };
}

describe("findEncounterLocation", () => {
  test("returns null when no venue row exists", async () => {
    expect(await findEncounterLocation(db, uid(),),).toBeNull();
  });

  test("returns the location_id from venue meta", async () => {
    const enc = uid();
    await insertVenue(enc, JSON.stringify({ location_id: "loc-1", },),);
    expect(await findEncounterLocation(db, enc,),).toBe("loc-1",);
  });

  test("returns null for null meta and for non-string location_id", async () => {
    const encNull = uid();
    await insertVenue(encNull, null,);
    expect(await findEncounterLocation(db, encNull,),).toBeNull();

    const encBad = uid();
    await insertVenue(encBad, JSON.stringify({ location_id: 42, },),);
    expect(await findEncounterLocation(db, encBad,),).toBeNull();
  });
});

describe("resolveAtmosphereBonus", () => {
  test("returns 0 when no venue is attached", async () => {
    const log = logStub();
    const bonus = await resolveAtmosphereBonus(db, locationsStub({ romantic: 99, dangerous: 0, },), log, uid(),);
    expect(bonus,).toBe(0,);
    expect(log.warns,).toEqual([],);
  });

  test("returns +2 for a romantic venue", async () => {
    const enc = uid();
    await insertVenue(enc, JSON.stringify({ location_id: "loc-romantic", },),);
    const bonus = await resolveAtmosphereBonus(db, locationsStub({ romantic: 80, dangerous: 5, },), logStub(), enc,);
    expect(bonus,).toBe(2,);
  });

  test("returns −2 for a dangerous venue", async () => {
    const enc = uid();
    await insertVenue(enc, JSON.stringify({ location_id: "loc-dangerous", },),);
    const bonus = await resolveAtmosphereBonus(db, locationsStub({ romantic: 10, dangerous: 90, },), logStub(), enc,);
    expect(bonus,).toBe(-2,);
  });

  test("returns 0 for a neutral venue", async () => {
    const enc = uid();
    await insertVenue(enc, JSON.stringify({ location_id: "loc-neutral", },),);
    const bonus = await resolveAtmosphereBonus(db, locationsStub({ romantic: 30, dangerous: 30, },), logStub(), enc,);
    expect(bonus,).toBe(0,);
  });

  test("fails open with 0 and logs when the consult throws", async () => {
    const enc = uid();
    await insertVenue(enc, JSON.stringify({ location_id: "loc-boom", },),);
    const log = logStub();
    const bonus = await resolveAtmosphereBonus(
      db,
      locationsStub(new Error("atmosphere service down",),),
      log,
      enc,
    );
    expect(bonus,).toBe(0,);
    expect(log.warns.length,).toBe(1,);
    expect(log.warns[0],).toContain(enc,);
  });
});

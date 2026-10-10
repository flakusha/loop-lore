// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parser/affordance telemetry tests: events land on the shared
 * `telemetry_events` sink (dev default = enabled) with the per-verb / per
 * -stage fields the hit-rate and denial-rate rollups read.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { createInMemoryDb, } from "../agency/__helpers/in-mem-db";
import { recordAffordanceOutcome, recordParseOutcome, } from "./telemetry";

let db: Kysely<DB>;
let raw: Database;

beforeEach(async () => {
  ({ db, raw, } = await createInMemoryDb());
},);

afterEach(() => {
  raw.close();
},);

function events(): Array<Record<string, unknown>> {
  return raw.query("SELECT event_type, event_data FROM telemetry_events",).all() as Array<
    Record<string, unknown>
  >;
}

describe("parser/affordance telemetry", () => {
  test("a parse outcome lands with stage, verb, and actor", async () => {
    await recordParseOutcome(db, { stage: "stage1", verb: "attack", confidence: 0.9, }, "actor-1",);

    const rows = events();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.event_type,).toBe("action_parser",);
    const data = JSON.parse(rows[0]!.event_data as string,);
    expect(data.stage,).toBe("stage1",);
    expect(data.verb,).toBe("attack",);
    expect(data.actor_id,).toBe("actor-1",);
  });

  test("an unparsed outcome records a null verb (miss for every hit rate)", async () => {
    await recordParseOutcome(db, { stage: "stage2", verb: null, },);

    const data = JSON.parse(events()[0]!.event_data as string,);
    expect(data.verb,).toBeNull();
  });

  test("allow and denial outcomes use distinct event types", async () => {
    await recordAffordanceOutcome(db, { verb: "equip", allowed: true, reason: "ok", },);
    await recordAffordanceOutcome(db, { verb: "equip", allowed: false, reason: "actor is not alive", },);

    const rows = events();
    expect(rows.map((r,) => r.event_type).sort(),).toEqual(["affordance_allow", "affordance_denial",],);
    const denial = JSON.parse(rows.find((r,) => r.event_type === "affordance_denial")!.event_data as string,);
    expect(denial.verb,).toBe("equip",);
    expect(denial.reason,).toBe("actor is not alive",);
  });
});

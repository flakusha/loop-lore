// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { AgencyDimension, AgencyMode, } from "../../db/enums";
import {
  incrementDimensionCounter,
  queryAgencyMetrics,
  recordAgencyMode,
} from "./quality-metrics";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { createInMemoryDb, } from "./__helpers/in-mem-db";

let db: Kysely<DB>;
let raw: Database;

beforeEach(async () => {
  ({ db, raw, } = await createInMemoryDb(),);
  // Seed a user (FK parent of chats.created_by), chat, actor, and log row.
  // insertUsers returns void, so we provide an explicit id and reuse it
  // for the chat.created_by FK.
  await insertUsers(db, "qm-user", "QM User", { id: "qm-user-id", },);
  raw.exec(`INSERT INTO chats(id, name, created_by, created_at) VALUES ('chat1', 'Test Chat', 'qm-user-id', datetime('now'));`,);
  raw.exec(`INSERT INTO actors(id, display_name, created_at) VALUES ('actor1', 'A', datetime('now'));`,);
  raw.exec(`INSERT INTO interaction_logs(id, chat_id, actor_id, command, category, skill, difficulty, outcome, agency_mode, created_at) VALUES ('log1', 'chat1', 'actor1', 'attack', 'combat', 'melee', 10, 'success', 'free', datetime('now'));`,);
},);

afterEach(() => { raw.close(); },);

describe("recordAgencyMode", () => {
  test("updates agency_mode on a specific row", async () => {
    await recordAgencyMode(db, "log1", AgencyMode.Forced,);
    const row = raw.query("SELECT agency_mode FROM interaction_logs WHERE id='log1'",).get() as { agency_mode: string };
    expect(row.agency_mode,).toBe("forced",);
  },);

  test("each mode round-trips", async () => {
    for (const mode of ["free", "forced", "blocked", "skipped"] as const) {
      await recordAgencyMode(db, "log1", mode as AgencyMode,);
      const row = raw.query("SELECT agency_mode FROM interaction_logs WHERE id='log1'",).get() as { agency_mode: string };
      expect(row.agency_mode,).toBe(mode,);
    }
  },);

  test("default rows backfilled to 'free' on insert", () => {
    raw.exec(`INSERT INTO interaction_logs(id, chat_id, actor_id, command, category, skill, difficulty, outcome, created_at) VALUES ('log2', 'chat1', 'actor1', 'move', 'social', 'movement', 0, 'success', datetime('now'));`,);
    const row = raw.query("SELECT agency_mode FROM interaction_logs WHERE id='log2'",).get() as { agency_mode: string };
    expect(row.agency_mode,).toBe("free",);
  },);
},);

describe("incrementDimensionCounter — six-dimension coverage", () => {
  for (const dim of ["spatial", "temporal", "manipulation", "social", "narrative", "ludic"] as const) {
    test(`counts events for dimension: ${dim}`, async () => {
      await incrementDimensionCounter(db, {
        chatId: "chat1",
        worldId: "worldA",
        dimension: dim as AgencyDimension,
        hourBucket: "2026-09-25T12",
        meaningful: false,
      },);
      const metrics = await queryAgencyMetrics(db, "worldA", "2026-09-01",);
      expect(metrics.byDimension[dim].total,).toBeGreaterThan(0,);
    },);
  }

  test("meaningful events increment the meaningful counter", async () => {
    await incrementDimensionCounter(db, {
      chatId: "chat1",
      worldId: "worldA",
      dimension: AgencyDimension.Social,
      hourBucket: "2026-09-25T13",
      meaningful: true,
    },);
    const metrics = await queryAgencyMetrics(db, "worldA", "2026-09-01",);
    expect(metrics.byDimension[AgencyDimension.Social].meaningful,).toBeGreaterThan(0,);
    expect(metrics.meaningful,).toBeGreaterThan(0,);
  },);

  test("non-meaningful events don't increment meaningful", async () => {
    await incrementDimensionCounter(db, {
      chatId: "chat1",
      worldId: "worldB",
      dimension: AgencyDimension.Narrative,
      hourBucket: "2026-09-25T14",
      meaningful: false,
    },);
    const metrics = await queryAgencyMetrics(db, "worldB", "2026-09-01",);
    expect(metrics.byDimension[AgencyDimension.Narrative].total,).toBeGreaterThan(0,);
    expect(metrics.byDimension[AgencyDimension.Narrative].meaningful,).toBe(0,);
  },);
},);

describe("queryAgencyMetrics — empty world", () => {
  test("returns zeros across all dimensions", async () => {
    const metrics = await queryAgencyMetrics(db, "world-empty", "2026-09-01",);
    expect(metrics.total,).toBe(0,);
    expect(metrics.meaningful,).toBe(0,);
    expect(Object.keys(metrics.byDimension,).length,).toBe(6,);
  },);
},);

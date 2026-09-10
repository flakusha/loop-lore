// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `runLlmAssist` — the LLM-assist pass gate.
 *
 * The function returns `{ entryId: null }` for any refused pass and a
 * real entry id for the happy path. Coverage here exercises:
 *   1. Unknown actor → entryId = null
 *   2. Actor with `llm_assist_enabled = 0` → entryId = null
 *   3. Static-mode actor → entryId = null
 *   4. Happy path with dynamic mode + enabled flag → inserts a pending
 *      `observation` entry and returns its id
 *   5. Caller-supplied hint axis / eventType override the defaults
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { GrowthEventType, } from "../../spec/growth";
import { runLlmAssist, } from "./llm-assist";

describe("runLlmAssist", () => {
  let db: Kysely<DB>;
  let ownerUserId: string;
  let enabledActor: string;
  let disabledActor: string;
  let staticActor: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerUserId = uid();
    await insertUsers(db, `u-${ownerUserId}`, "Owner User", { id: ownerUserId, },);

    enabledActor = uid();
    disabledActor = uid();
    staticActor = uid();
    await insertActors(db, "Enabled Actor", {
      id: enabledActor,
      user_id: ownerUserId,
      owner_id: ownerUserId,
      actor_type: "character",
      // growth_mode defaults to "dynamic" but we set both explicitly
      // to make the intent obvious.
      llm_assist_enabled: 1,
      growth_mode: "dynamic",
    },);
    await insertActors(db, "Disabled Actor", {
      id: disabledActor,
      user_id: ownerUserId,
      owner_id: ownerUserId,
      actor_type: "character",
      llm_assist_enabled: 0,
      growth_mode: "dynamic",
    },);
    await insertActors(db, "Static Actor", {
      id: staticActor,
      user_id: ownerUserId,
      owner_id: ownerUserId,
      actor_type: "character",
      llm_assist_enabled: 1,
      growth_mode: "static",
    },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns entryId=null when the actor does not exist", async () => {
    const result = await runLlmAssist(db, {
      actorId: "ghost-actor",
      chatContext: "anything",
    },);
    expect(result,).toEqual({ entryId: null, },);
  });

  test("returns entryId=null when llm_assist_enabled is false", async () => {
    const result = await runLlmAssist(db, {
      actorId: disabledActor,
      chatContext: "anything",
    },);
    expect(result,).toEqual({ entryId: null, },);
  });

  test("returns entryId=null when the actor's growth_mode is 'static'", async () => {
    const result = await runLlmAssist(db, {
      actorId: staticActor,
      chatContext: "anything",
    },);
    expect(result,).toEqual({ entryId: null, },);
  });

  test("inserts a pending observation entry and returns its id on the happy path", async () => {
    const result = await runLlmAssist(db, {
      actorId: enabledActor,
      chatContext: "user talked about apples",
    },);
    expect(result.entryId,).not.toBeNull();
    expect(typeof result.entryId,).toBe("string",);

    const row = await db
      .selectFrom("growth_log",)
      .where("id", "=", result.entryId!,)
      .selectAll()
      .executeTakeFirst();
    expect(row,).toBeDefined();
    expect(row?.actor_id,).toBe(enabledActor,);
    expect(row?.axis,).toBe("arc",);
    expect(row?.event_type,).toBe(GrowthEventType.Observation,);
    expect(row?.status,).toBe("pending",);
  });

  test("honours the caller-supplied hint.axis and hint.eventType", async () => {
    const result = await runLlmAssist(db, {
      actorId: enabledActor,
      chatContext: "user took decisive action",
      hint: { axis: "trait", eventType: GrowthEventType.TraitDrifted, },
    },);

    expect(result.entryId,).not.toBeNull();
    const row = await db
      .selectFrom("growth_log",)
      .where("id", "=", result.entryId!,)
      .selectAll()
      .executeTakeFirst();
    expect(row?.axis,).toBe("trait",);
    expect(row?.event_type,).toBe(GrowthEventType.TraitDrifted,);
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Failed-check consequence store tests (WI-3).
 *
 * Roundtrip over a real test DB: record -> default gate loader flags the
 * constrained claim -> resolve clears it; scope isolation, cap, and
 * double-resolve semantics.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";

import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { createImmersionGate, } from "./engine";
import {
  dbPendingConsequenceLoader,
  loadOpenFailedChecks,
  MAX_PENDING_CONSEQUENCES,
  recordFailedCheck,
  resolveFailedCheck,
} from "./pending-consequences";
import { DEFAULT_IMMERSION_CONFIG, GateRuleId, GateSeverity, } from "./types";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
},);

/** Gate config that surfaces pending-failed-check as hard-block. */
function hardBlockConfig(): typeof DEFAULT_IMMERSION_CONFIG {
  return {
    ...DEFAULT_IMMERSION_CONFIG,
    rules: {
      ...DEFAULT_IMMERSION_CONFIG.rules,
      [GateRuleId.PendingFailedCheck]: {
        enabled: true,
        severity: GateSeverity.HardBlock,
      },
    },
  };
}

describe("failed-check consequence store", () => {
  test("record -> load -> resolve roundtrip normalizes and clears", async () => {
    const chatId = "chat-fc-1";
    const actorId = "actor-fc-1";
    const id = await recordFailedCheck(db, {
      chatId,
      actorId,
      blockedAction: "  Break FREE ",
      reason: "the chains held firm",
      source: "battle",
    },);

    const open = await loadOpenFailedChecks(db, { chatId, actorId, },);
    expect(open,).toHaveLength(1,);
    expect(open[0]?.id,).toBe(id,);
    expect(open[0]?.blockedAction,).toBe("break free",);
    expect(open[0]?.reason,).toBe("the chains held firm",);

    expect(await resolveFailedCheck(db, id,),).toBe(true,);
    expect(await loadOpenFailedChecks(db, { chatId, actorId, },),).toEqual([],);
    expect(await resolveFailedCheck(db, id,),).toBe(false,);
  });

  test("scope isolation: other chats and actors are not constrained", async () => {
    await recordFailedCheck(db, {
      chatId: "chat-fc-2",
      actorId: "actor-fc-2",
      blockedAction: "sprint",
      reason: "legs gave out",
      source: "dice",
    },);

    expect(await loadOpenFailedChecks(db, { chatId: "chat-fc-2", actorId: "other", },),).toEqual([],);
    expect(await loadOpenFailedChecks(db, { chatId: "other", actorId: "actor-fc-2", },),).toEqual([],);
    expect(await loadOpenFailedChecks(db, { chatId: "chat-fc-2", actorId: "actor-fc-2", },),).toHaveLength(1,);
  });

  test("open rows cap at MAX_PENDING_CONSEQUENCES", async () => {
    const chatId = "chat-fc-cap";
    const actorId = "actor-fc-cap";
    for (let i = 0; i < MAX_PENDING_CONSEQUENCES + 3; i++) {
      await recordFailedCheck(db, {
        chatId,
        actorId,
        blockedAction: `block${i}`,
        reason: `reason ${i}`,
        source: "manual",
      },);
    }

    expect(await loadOpenFailedChecks(db, { chatId, actorId, },),).toHaveLength(MAX_PENDING_CONSEQUENCES,);
  });

  test("default gate loader constrains follow-up claims from the DB store", async () => {
    const chatId = "chat-fc-3";
    const actorId = "actor-fc-3";
    const id = await recordFailedCheck(db, {
      chatId,
      actorId,
      blockedAction: "sprint",
      reason: "the sprained ankle failed its check",
      source: "dice",
    },);

    const gate = createImmersionGate({ db, config: hardBlockConfig(), },);
    const verdict = await gate.evaluate({
      chatId,
      actorId,
      worldId: null,
      content: "I sprint away anyway",
    },);

    expect(verdict.severity,).toBe(GateSeverity.HardBlock,);
    expect(verdict.ruleId,).toBe(GateRuleId.PendingFailedCheck,);
    expect(verdict.stateSnapshot.pendingConsequences,).toHaveLength(1,);

    // Resolve the consequence: the same claim is no longer constrained.
    await resolveFailedCheck(db, id,);
    const after = await gate.evaluate({
      chatId,
      actorId,
      worldId: null,
      content: "I sprint away anyway",
    },);

    expect(after.severity,).toBe(GateSeverity.Allow,);
  });

  test("dbPendingConsequenceLoader adapts the db reader to the loader shape", async () => {
    const chatId = "chat-fc-adapter";
    const actorId = "actor-fc-adapter";
    const id = await recordFailedCheck(db, {
      chatId,
      actorId,
      source: "dice",
      blockedAction: "sprint",
      reason: "DEX save failed",
    },);

    const loader = dbPendingConsequenceLoader(db,);
    const open = await loader({ chatId, actorId, worldId: null, content: "I sprint away", },);
    expect(open,).toHaveLength(1,);
    expect(open[0]!.id,).toBe(id,);
    expect(open[0]!.blockedAction,).toBe("sprint",);

    // Resolved consequences disappear from the adapter's view too.
    await resolveFailedCheck(db, id,);
    expect(await loader({ chatId, actorId, worldId: null, content: "I sprint away", },),).toHaveLength(0,);
  });
});

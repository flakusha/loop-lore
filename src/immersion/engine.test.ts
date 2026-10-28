// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gate engine tests — orchestration over a real test DB.
 *
 * End-to-end deterministic path: extraction → snapshot → rules → verdict,
 * including the AC1 default (captive "I sprint away" ≥ annotate) and the
 * pending-consequence loader seam (WI-3 input).
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { CharacterState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterStats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { createImmersionGate, } from "./engine";
import { type GateInput, GateRuleId, GateSeverity, } from "./types";

let db: Kysely<DB>;
let actorId: string;

const BASE_INPUT: Omit<GateInput, "actorId" | "content"> = {
  chatId: "chat-1",
  worldId: null,
};

/** Seed a captive actor (restriction condition). */
async function seedCaptive(): Promise<string> {
  const id = crypto.randomUUID();
  await insertActors(db, "Captive", { id, agent_type: "ai", } as never,);
  await insertCharacterStats(db, id, 10, 10, 10, {
    character_state: CharacterState.Active,
    conditions: JSON.stringify([{ name: "restrained by ropes", },],),
  },);

  return id;
}

describe("createImmersionGate", () => {
  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    actorId = crypto.randomUUID();
    await insertActors(db, "Free Actor", { id: actorId, agent_type: "ai", } as never,);
    await insertUsers(db, "owner", "Owner", { id: crypto.randomUUID(), } as never,);
  },);

  test("AC1: captive actor claiming to sprint away is at least annotate", async () => {
    const captive = await seedCaptive();
    const gate = createImmersionGate({ db, },);
    const verdict = await gate.evaluate({
      ...BASE_INPUT,
      actorId: captive,
      content: "I sprint away from the campfire",
    },);

    expect(verdict.severity,).toBe(GateSeverity.Annotate,);
    expect(verdict.ruleId,).toBe(GateRuleId.MovementWhileRestrained,);
    expect(verdict.engine,).toBe("deterministic",);
    expect(verdict.claims[0],).toMatchObject({ kind: "movement", verb: "sprint", },);
    expect(verdict.findings[0]?.reason,).toContain("freedom of movement",);
    expect(verdict.stateSnapshot.restricted,).toBe(true,);
  });

  test("free actor claiming to sprint is allowed", async () => {
    const gate = createImmersionGate({ db, },);
    const verdict = await gate.evaluate({
      ...BASE_INPUT,
      actorId,
      content: "I sprint away from the campfire",
    },);

    expect(verdict.severity,).toBe(GateSeverity.Allow,);
    expect(verdict.ruleId,).toBeNull();
    expect(verdict.findings,).toEqual([],);
  });

  test("message without claims never queries the world", async () => {
    const gate = createImmersionGate({ db, },);
    const verdict = await gate.evaluate({
      ...BASE_INPUT,
      actorId,
      content: "I think about the weather for a while.",
    },);

    expect(verdict.severity,).toBe(GateSeverity.Allow,);
    expect(verdict.claims,).toEqual([],);
    expect(verdict.stateSnapshot.skills,).toEqual([],);
  });

  test("pending-consequence loader feeds the rule (WI-3 input)", async () => {
    const gate = createImmersionGate({
      db,
      loadPendingConsequences: async () => [{
        id: "fc-1",
        blockedAction: "break",
        reason: "the chains held firm",
      },],
    },);

    const verdict = await gate.evaluate({
      ...BASE_INPUT,
      actorId,
      content: "I try to break the chains again",
    },);

    expect(verdict.severity,).toBe(GateSeverity.Annotate,);
    expect(verdict.ruleId,).toBe(GateRuleId.PendingFailedCheck,);
    expect(verdict.stateSnapshot.pendingConsequences,).toHaveLength(1,);
  });

  test("per-rule severity override flows into the verdict", async () => {
    const captive = await seedCaptive();
    const configured = createImmersionGate({
      db,
      config: {
        rules: {
          [GateRuleId.MovementWhileRestrained]: {
            enabled: true,
            severity: GateSeverity.HardBlock,
          },
          [GateRuleId.SkillNotOwned]: { enabled: true, severity: GateSeverity.Annotate, },
          [GateRuleId.ItemNotInInventory]: { enabled: true, severity: GateSeverity.Annotate, },
          [GateRuleId.PendingFailedCheck]: { enabled: true, severity: GateSeverity.Annotate, },
        },
      },
    },);

    const verdict = await configured.evaluate({
      ...BASE_INPUT,
      actorId: captive,
      content: "I sprint away",
    },);

    expect(verdict.severity,).toBe(GateSeverity.HardBlock,);
  });
});

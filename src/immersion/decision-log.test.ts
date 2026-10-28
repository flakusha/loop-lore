// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Decision-log audit writer tests (WI-6).
 *
 * One append-only row per gate decision with claims, snapshot, verdict
 * and engine attribution; the write is best-effort — failures are
 * swallowed so the gate decision never depends on the audit.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, } from "kysely";

import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { recordImmersionDecision, } from "./decision-log";
import { GateRuleId, GateSeverity, } from "./types";
import type { GateVerdict, } from "./types";

let db: Kysely<DB>;

/** A representative verdict for the audit row. */
function verdict(): GateVerdict {
  return {
    severity: GateSeverity.SoftRefuse,
    ruleId: GateRuleId.MovementWhileRestrained,
    claims: [{ kind: "movement", verb: "sprint", text: "I sprint away", matchIndex: 0, },],
    stateSnapshot: {
      actorId: "actor-dl-1",
      restricted: true,
      characterState: "active",
      conditions: ["bound",],
      skills: [],
      inventory: [],
      pendingConsequences: [],
    },
    findings: [{
      ruleId: GateRuleId.MovementWhileRestrained,
      severity: GateSeverity.SoftRefuse,
      claim: { kind: "movement", verb: "sprint", text: "I sprint away", matchIndex: 0, },
      reason: "missing precondition: freedom of movement",
    },],
    engine: "deterministic",
  };
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
},);

describe("recordImmersionDecision", () => {
  test("writes one audit row with claims, snapshot, verdict and attribution", async () => {
    await recordImmersionDecision(db, {
      chatId: "chat-dl-1",
      actorId: "actor-dl-1",
      source: "pregeneration",
      verdict: verdict(),
    },);

    const row = await db
      .selectFrom("immersion_decision_log",)
      .selectAll()
      .where("chat_id", "=", "chat-dl-1",)
      .executeTakeFirst();

    expect(row,).toBeDefined();
    expect(row!.actor_id,).toBe("actor-dl-1",);
    expect(row!.source,).toBe("pregeneration",);
    expect(row!.severity,).toBe(GateSeverity.SoftRefuse,);
    expect(row!.rule_id,).toBe(GateRuleId.MovementWhileRestrained,);
    expect(row!.engine,).toBe("deterministic",);
    expect(row!.claims,).toContain("sprint",);
    expect(row!.state_snapshot,).toContain("bound",);
    expect(row!.verdict,).toContain("freedom of movement",);
  });

  test("never throws when the audit insert fails", async () => {
    const broken = {
      insertInto: () => {
        throw new Error("db down",);
      },
    } as unknown as Kysely<DB>;

    await expect(
      recordImmersionDecision(broken, {
        chatId: "chat-dl-2",
        actorId: "actor-dl-2",
        source: "classifier",
        verdict: verdict(),
      },),
    ).resolves.toBeUndefined();
  });
});

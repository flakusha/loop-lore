// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-chat gate config + decision-log tests (WI-6).
 *
 * resolveImmersionGateConfig: valid override merges over defaults; unknown
 * rule ids and illegal severities are dropped; malformed/absent gm_config
 * yields undefined. recordImmersionDecision + wiring: pregeneration/hook
 * paths write audit rows with claims, snapshot, severity and attribution.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, } from "kysely";

import { MessageStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterStats,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { resolveImmersionGateConfig, } from "./gate-config";
import { ImmersionGateHook, } from "./gate-hook";
import { runImmersionGatePrecheck, } from "./pregeneration";
import { DEFAULT_IMMERSION_CONFIG, GateRuleId, GateSeverity, } from "./types";

let db: Kysely<DB>;
let chatId: string;
let actorId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await insertUsers(db, "wi6-user", "WI6 User",);
  const ownerId = await db.selectFrom("users",).select("id",).where("username", "=", "wi6-user",).executeTakeFirst();
  chatId = await insertChats(db, "wi6-chat", ownerId!.id,);
  actorId = await insertActors(db, "WI6 Actor",);
  await insertCharacterStats(db, actorId, 100, 100, 10, {
    conditions: JSON.stringify(["bound", "webbed to the wall",],),
  },);
},);

/** gm_config JSON carrying an immersionGate override. */
function gm(immersionGate: unknown,): string {
  return JSON.stringify({ assistantRole: "gm", immersionGate, },);
}

describe("resolveImmersionGateConfig", () => {
  test("valid override merges over defaults", () => {
    const resolved = resolveImmersionGateConfig(gm({
      rules: { [GateRuleId.MovementWhileRestrained]: { enabled: true, severity: "hard-block", }, },
    },),);

    expect(resolved,).toBeDefined();
    expect(resolved?.rules[GateRuleId.MovementWhileRestrained],).toEqual({
      enabled: true,
      severity: GateSeverity.HardBlock,
    },);

    // Untouched rule keeps its default.
    expect(resolved?.rules[GateRuleId.SkillNotOwned],).toEqual(
      DEFAULT_IMMERSION_CONFIG.rules[GateRuleId.SkillNotOwned],
    );
  });

  test("unknown rule ids and illegal severities are dropped", () => {
    const resolved = resolveImmersionGateConfig(gm({
      rules: {
        "immersion.made-up-rule": { enabled: true, severity: "hard-block", },
        [GateRuleId.MovementWhileRestrained]: { enabled: true, severity: "nuke-everything", },
        [GateRuleId.SkillNotOwned]: { enabled: false, },
      },
    },),);

    expect(resolved,).toBeDefined();
    expect(resolved?.rules["immersion.made-up-rule" as GateRuleId],).toBeUndefined();
    expect(resolved?.rules[GateRuleId.MovementWhileRestrained],).toEqual(
      DEFAULT_IMMERSION_CONFIG.rules[GateRuleId.MovementWhileRestrained],
    );

    expect(resolved?.rules[GateRuleId.SkillNotOwned],).toEqual({ enabled: false, severity: GateSeverity.Annotate, },);
  });

  test("absent, malformed, or override-free gm_config yields undefined", () => {
    expect(resolveImmersionGateConfig(null,),).toBeUndefined();
    expect(resolveImmersionGateConfig("",),).toBeUndefined();
    expect(resolveImmersionGateConfig("not json at all",),).toBeUndefined();
    expect(resolveImmersionGateConfig(JSON.stringify({ assistantRole: "gm", },),),).toBeUndefined();
    expect(resolveImmersionGateConfig(gm({ noRulesHere: true, },),),).toBeUndefined();
  });
});

describe("decision-log audit wiring", () => {
  test("pregeneration writes an audit row per decision (allow included)", async () => {
    const beatId = await insertMessages(db, chatId, actorId, "user", "I sprint away from the ropes", {
      status: MessageStatus.Confirmed,
    },);

    await runImmersionGatePrecheck({
      db,
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I sprint away from the ropes",
      parentMessageId: beatId,
      eventHandlers: [],
    },);

    const rows = await db
      .selectFrom("immersion_decision_log",)
      .select(["source", "severity", "rule_id", "engine", "claims", "state_snapshot",],)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .orderBy("created_at", "desc",)
      .execute();

    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    const row = rows[0]!;
    expect(row.source,).toBe("pregeneration",);
    expect(row.severity,).toBe(GateSeverity.Annotate,);
    expect(row.engine,).toBe("deterministic",);
    expect(row.claims,).toContain("movement",);
    expect(row.state_snapshot,).toContain("restricted",);
  });

  test("per-chat gm_config override raises severity to hard-block", async () => {
    const gmConfig = gm({
      rules: { [GateRuleId.MovementWhileRestrained]: { enabled: true, severity: "hard-block", }, },
    },);

    await db.updateTable("chats",).set({ gm_config: gmConfig, },).where("id", "=", chatId,).execute();

    try {
      const result = await runImmersionGatePrecheck({
        db,
        chatId,
        actorId,
        actorName: "Kara",
        worldId: null,
        content: "I sprint away from the ropes",
        parentMessageId: null,
        eventHandlers: [],
      },);

      expect(result.action,).toBe("blocked",);
    } finally {
      await db.updateTable("chats",).set({ gm_config: null, },).where("id", "=", chatId,).execute();
    }

    const top = await db
      .selectFrom("immersion_decision_log",)
      .select("severity",)
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .executeTakeFirst();

    expect(top?.severity,).toBe(GateSeverity.HardBlock,);
  });

  test("hook path writes audit rows attributed to the hook source", async () => {
    const hook = new ImmersionGateHook();
    await hook.execute("I sprint away from the ropes", {
      chatId,
      actorId,
      userId: "wi6-user",
      content: "I sprint away from the ropes",
      config: {} as never,
      nsfwConfig: {} as never,
      db,
    },);

    const top = await db
      .selectFrom("immersion_decision_log",)
      .select(["source", "severity",],)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .executeTakeFirst();

    expect(top?.source,).toBe("hook",);
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dispatch tests (TASK-harness-production-dispatch-path-runturn-caller-tasktype-mem):
 * the production caller of the outbound ACP stack.
 *
 * Resource contract: ONE in-memory migrated DB per test (its own
 * user/actor/chat ids), the process-shared admin-settings store (seeded and
 * reset around every test), in-memory fake adapters, and one exec-log file in
 * a temp dir (reset to the repo default afterwards). No child process, no
 * ports, no cross-test state.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type HarnessAcpConfig, } from "../../config/schema/harness";
import { resetExecLogPath, setExecLogPath, } from "../../harness/exec-log";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import {
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "./admin-settings";
import { dispatchHarnessTurn, HarnessDispatchError, } from "./dispatch";
import { fakeFactory, } from "./fakes";
import { createHarnessRuntime, } from "./runtime";

let userId: string;
let actorId: string;
let chatId: string;
let tag = "";
let idCounter = 0;

let fixture: TestDb;
let execLog: string;

/** The ACP config the admin store and the runtime are seeded with. */
function acpConfig(): HarnessAcpConfig {
  return {
    enabled: true,
    profiles: [
      {
        name: "omp",
        command: ["omp",],
        tiers: { fast: { model: "zai/flash", capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },
      {
        name: "other",
        command: ["other",],
        tiers: { fast: { model: "zai/flash", capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },
    ],
  };
}

/** The exec-log lines the dispatch wrote; none when the file was never created. */
function execLines(): { task_type: string; profile?: string; result: string }[] {
  if (!existsSync(execLog,)) { return []; }

  return readFileSync(execLog, "utf8",)
    .split("\n",)
    .filter((line,) => line.trim().length > 0)
    .map((line,) => JSON.parse(line,) as { task_type: string; profile?: string; result: string });
}

beforeEach(async () => {
  tag = `d${++idCounter}`;
  userId = `user-harness-dispatch-${tag}`;
  actorId = `actor-harness-dispatch-${tag}`;
  chatId = `chat-harness-dispatch-${tag}`;
  fixture = await createTestDb();
  execLog = join(mkdtempSync(join(tmpdir(), "harness-dispatch-",),), "executions.jsonl",);
  setExecLogPath(execLog,);
  initHarnessAdminSettings(acpConfig(),);

  await fixture.db.insertInto("users",).values({
    id: userId,
    username: `harness-dispatch-${tag}`,
    display_name: "Harness Dispatch",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(fixture.db, "Alice", {
    id: actorId,
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  await fixture.db.insertInto("chats",).values({
    id: chatId,
    name: "Harness Dispatch",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
},);

afterEach(async () => {
  resetHarnessAdminSettings();
  resetExecLogPath();
  await destroyTestDb(fixture,);
},);

describe("dispatchHarnessTurn", () => {
  it("runs the turn through the composed runtime and lands the rows", async () => {
    const { factory, logs, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "the answer", }, },);
    const runtime = createHarnessRuntime({ acp: acpConfig(), factory, },);

    const outcome = await dispatchHarnessTurn({
      runtime,
      role: "solo",
      userId,
      profile: "omp",
      prompt: "do the thing",
      database: fixture.db,
      chatId,
      actorId,
    },);

    expect(outcome.turn.profile,).toBe("omp",);
    expect(outcome.turn.tier,).toBe("fast",);
    expect(outcome.turn.model,).toBe("zai/flash",);
    expect(logs.get("omp",)?.prompts,).toEqual(["do the thing",],);

    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.id,).toBe(outcome.messageId,);
    expect(rows[0]?.role,).toBe("assistant",);

    const lines = execLines();
    expect(lines,).toHaveLength(1,);
    expect(lines[0]?.task_type,).toBe("harness",);
    expect(lines[0]?.profile,).toBe("omp",);
    expect(lines[0]?.result,).toBe("ok",);
  });

  it("runs only the profile the gate cleared", async () => {
    const { factory, logs, } = fakeFactory({
      omp: { models: ["zai/flash",], reply: "ok", },
      other: { models: ["zai/flash",], reply: "ok", },
    },);

    const runtime = createHarnessRuntime({ acp: acpConfig(), factory, },);

    await dispatchHarnessTurn({
      runtime,
      role: "solo",
      userId,
      profile: "omp",
      prompt: "pinned",
      database: fixture.db,
      chatId,
      actorId,
    },);

    expect(logs.get("omp",)?.prompts,).toEqual(["pinned",],);
    expect(logs.get("other",),).toBeUndefined();
  });

  it("refuses a caller without the admin role", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], }, },);
    const runtime = createHarnessRuntime({ acp: acpConfig(), factory, },);

    const refusal = await dispatchHarnessTurn({
      runtime,
      role: "user",
      userId,
      profile: "omp",
      prompt: "nope",
      database: fixture.db,
      chatId,
      actorId,
    },).catch((error: unknown,) => error);

    expect(refusal,).toBeInstanceOf(HarnessDispatchError,);
    expect((refusal as HarnessDispatchError).code,).toBe("role_denied",);
    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(0,);
    expect(execLines(),).toHaveLength(0,);
  });

  it("refuses a profile the admin never configured", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], }, },);
    const runtime = createHarnessRuntime({ acp: acpConfig(), factory, },);

    const refusal = await dispatchHarnessTurn({
      runtime,
      role: "solo",
      userId,
      profile: "ghost",
      prompt: "nope",
      database: fixture.db,
      chatId,
      actorId,
    },).catch((error: unknown,) => error);

    expect(refusal,).toBeInstanceOf(HarnessDispatchError,);
    expect((refusal as HarnessDispatchError).code,).toBe("profile_unknown",);
  });

  it("surfaces a failed turn and records it in the exec log", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], failPrompt: "prompt", }, },);
    const runtime = createHarnessRuntime({ acp: acpConfig(), factory, },);

    const refusal = await dispatchHarnessTurn({
      runtime,
      role: "solo",
      userId,
      profile: "omp",
      prompt: "boom",
      database: fixture.db,
      chatId,
      actorId,
    },).catch((error: unknown,) => error);

    expect(refusal,).toBeInstanceOf(HarnessDispatchError,);
    expect((refusal as HarnessDispatchError).code,).toBe("turn_failed",);
    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(0,);

    const lines = execLines();
    expect(lines,).toHaveLength(1,);
    expect(lines[0]?.result,).toBe("error",);
    expect(lines[0]?.task_type,).toBe("harness",);
  });
});

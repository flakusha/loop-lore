// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * acp-authorization.test.ts — the ACP path driven over the REAL wire
 * (TASK-agentic-integration-tests).
 *
 * The delivered ACP seam is loop-lore as an ACP CLIENT: the generic ACP
 * engine (`initialize` → `session/new` → `session/prompt`, newline-delimited
 * JSON-RPC 2.0 over stdio) driving an external harness. Its authorization
 * surface is the pair
 *
 *  - the isolation gate (`assertHarnessExecution`): master switch, admin role,
 *    admin-configured profile — every denial is a typed code, never a spawn;
 *  - the permission policy + queue (`classifyPermission` → `PermissionQueue`):
 *    a write-shaped ask is NEVER auto-allowed; it parks for a human and the
 *    harness is told `reject_once` when the human denies it.
 *
 * Both are exercised against a REAL child process speaking ACP (the fake ACP
 * server fixture), so the assertions are about bytes on the wire, not about a
 * stub. The "authorized path still succeeds" counterpart is the production
 * dispatch (`dispatchHarnessTurn`) landing a turn in a real chat.
 *
 * Resource contract (parallel-safe): ONE fake ACP child per test (own
 * mkdtemp dir, no ports), one :memory: SQLite per test, one exec-log file per
 * test; the process-shared admin-settings store is seeded and reset around
 * every test. Synchronization is promise-based (a bounded poll on the queue),
 * never a sleep.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type HarnessAcpConfig, } from "../../config/schema/harness";
import { resetExecLogPath, setExecLogPath, } from "../../harness/exec-log";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { initHarnessAdminSettings, resetHarnessAdminSettings, } from "./admin-settings";
import { dispatchHarnessTurn, HarnessDispatchError, } from "./dispatch";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { createHarnessRuntime, } from "./runtime";

/** The profile the fake ACP server is bound to. */
const PROFILE = "acp";
/** The model the fake server advertises (the profile's tier must match). */
const MODEL = "zai/flash";

let fixture: TestDb;
let userId: string;
let actorId: string;
let chatId: string;
let execLog: string;
let tag = "";
let idCounter = 0;

/** Fake ACP servers started by the current test; reaped after each. */
const servers: FakeAcpServer[] = [];

/** The ACP config the admin store and the runtime are seeded with. */
function acpConfig(command: string[],): HarnessAcpConfig {
  return {
    enabled: true,
    profiles: [
      {
        name: PROFILE,
        command,
        tiers: { fast: { model: MODEL, capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },
    ],
  };
}

/** Start a fake ACP server and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  servers.push(server,);
  return server;
}

/** The exec-log lines the dispatch wrote; none when the file was never created. */
function execLines(): Array<{ task_type: string; profile?: string; result: string }> {
  if (!existsSync(execLog,)) { return []; }

  return readFileSync(execLog, "utf8",)
    .split("\n",)
    .filter((line,) => line.trim().length > 0)
    .map((line,) => JSON.parse(line,) as { task_type: string; profile?: string; result: string });
}

/**
 * Wait until the value is available (bounded poll — the queue parks an ask
 * asynchronously, after the wire request arrives).
 * @param read - the value source; null/undefined means "not yet"
 * @param timeoutMs - deadline
 * @returns the first non-null value
 * @throws {Error} when the deadline passes without a value.
 */
async function waitFor<T,>(read: () => T | null | undefined, timeoutMs = 4000,): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = read();
    if (value !== null && value !== undefined) { return value; }

    if (Date.now() > deadline) { throw new Error("timed out waiting for the harness",); }

    await new Promise((resolve,) => setTimeout(resolve, 10,));
  }
}

beforeEach(async () => {
  tag = `a${++idCounter}`;
  userId = `user-acp-auth-${tag}`;
  actorId = `actor-acp-auth-${tag}`;
  chatId = `chat-acp-auth-${tag}`;
  fixture = await createTestDb();
  execLog = join(mkdtempSync(join(tmpdir(), "acp-auth-",),), "executions.jsonl",);
  setExecLogPath(execLog,);

  await fixture.db.insertInto("users",).values({
    id: userId,
    username: `acp-auth-${tag}`,
    display_name: "ACP Auth",
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
    name: "ACP Auth",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
},);

afterEach(async () => {
  while (servers.length > 0) { servers.pop()?.stop(); }

  resetHarnessAdminSettings();
  resetExecLogPath();
  await destroyTestDb(fixture,);
},);

describe("ACP path — permission approval over the real wire", () => {
  it("parks a write ask for a human and answers reject_once when the human denies", async () => {
    const server = serve({ FAKE_PERMISSION: "1", FAKE_REPLY: "the harness spoke", FAKE_MODELS: MODEL, },);
    const acp = acpConfig(server.argv,);
    initHarnessAdminSettings(acp,);

    const runtime = createHarnessRuntime({ acp, },);
    await runtime.registry.ensureProbed(PROFILE,);

    const adapter = runtime.registry.connection(PROFILE,);
    expect(adapter,).toBeDefined();

    // The prompt stays in flight while the ask waits for a human.
    const turnPromise = adapter!.prompt("write a file",);

    const pending = await waitFor(() => runtime.permissions.listPending()[0] ?? null);
    expect(pending.tool,).toBe("edit",);
    expect(runtime.permissions.pendingCount(),).toBe(1,);

    const decision = runtime.permissions.resolve({ id: pending.id, decision: "deny", },);
    expect(decision.ok,).toBe(true,);

    const turn = await turnPromise;
    expect(turn.text,).toBe("the harness spoke",);
    expect(runtime.permissions.pendingCount(),).toBe(0,);

    // The harness was told the operation was refused — the write never ran.
    const outcomes = server.readLog().filter((entry,) => entry.event === "permission_outcome");
    expect(outcomes,).toHaveLength(1,);
    expect(JSON.stringify(outcomes[0]?.outcome,),).toContain("reject_once",);
  });

  it("refuses a caller without the admin role before any turn runs", async () => {
    const server = serve({ FAKE_REPLY: "never reached", FAKE_MODELS: MODEL, },);
    const acp = acpConfig(server.argv,);
    initHarnessAdminSettings(acp,);

    const runtime = createHarnessRuntime({ acp, },);

    const refusal = await dispatchHarnessTurn({
      runtime,
      role: "user",
      userId,
      profile: PROFILE,
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

  it("lets the authorized admin caller drive a turn over the ACP wire into the chat", async () => {
    const server = serve({ FAKE_REPLY: "answered over acp", FAKE_MODELS: MODEL, },);
    const acp = acpConfig(server.argv,);
    initHarnessAdminSettings(acp,);

    const runtime = createHarnessRuntime({ acp, },);

    const outcome = await dispatchHarnessTurn({
      runtime,
      role: "solo",
      userId,
      profile: PROFILE,
      prompt: "say something",
      database: fixture.db,
      chatId,
      actorId,
    },);

    expect(outcome.turn.profile,).toBe(PROFILE,);
    expect(outcome.turn.model,).toBe(MODEL,);
    expect(outcome.turn.result.text,).toBe("answered over acp",);

    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.id,).toBe(outcome.messageId,);
    expect(rows[0]?.role,).toBe("assistant",);

    const lines = execLines();
    expect(lines,).toHaveLength(1,);
    expect(lines[0]?.task_type,).toBe("harness",);
    expect(lines[0]?.profile,).toBe(PROFILE,);
    expect(lines[0]?.result,).toBe("ok",);
  });
});

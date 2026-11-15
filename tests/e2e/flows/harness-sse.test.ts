// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: harness turn → chat SSE stream.
 *
 * The harness dispatch path end to end: a gated harness turn runs over the
 * fake ACP server fixture (the SAME fixture the ACP e2e uses), the turn lands
 * as a chat row, and the turn's frames reach the chat's live stream —
 * `GET /api/v1/generation/stream/:chatId`.
 *
 * The assertions are on the OBSERVABLE stream (the SSE event names and their
 * JSON payloads) plus the row the turn produced in the chat.
 *
 * Resource contract (parallel-safe): one fake ACP child + one harness fixture
 * per test (own temp dir, no ports, no fixed paths), the adapter connection
 * closed and the chat's stream buffer removed in afterEach, and the
 * process-shared admin-settings store seeded and reset around every test.
 * Synchronization is promise-based (the dispatch resolves, the stream replays
 * the buffered frames), never a sleep.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type HarnessAcpConfig, } from "../../../src/config/schema/harness";
import { getOrCreateBuffer, removeBuffer, } from "../../../src/generation/stream-buffer";
import { resetExecLogPath, setExecLogPath, } from "../../../src/harness/exec-log";
import {
  getHarnessAdminFileConfig,
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "../../../src/integrations/harness/admin-settings";
import { dispatchHarnessTurn, } from "../../../src/integrations/harness/dispatch";
import {
  createHarnessFixture,
  type HarnessFixture,
} from "../../../src/integrations/harness/harness-fixture";
import { assertHarnessExecution, } from "../../../src/integrations/harness/isolation-gate";
import { createHarnessRuntime, type HarnessRuntime, } from "../../../src/integrations/harness/runtime";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

/** The profile the fake ACP server is bound to. */
const PROFILE = "fake-acp";
/** The model the fake server advertises (the profile's tier must match). */
const MODEL = "zai/glm";
/** The harness's reply — the text the chat stream must carry. */
const REPLY = "the harness answered over acp";

let server: TestServer;
let api: ApiClient;
/** The harness fixture opened by the current test; released after each. */
let fixture: HarnessFixture | null = null;
/** The runtime composed by the current test; its adapter is closed after each. */
let runtime: HarnessRuntime | null = null;
/** The temp dir holding this test's exec log; removed after each. */
let execLogDir = "";

beforeAll(async () => {
  server = await createTestServer({ auth: { required: true, }, },);
  await seedAll(server.db,);
  api = createClient(server.url,);
  await api.loginAs(SEED.admin.username, SEED.admin.password,);
},);

afterAll(async () => {
  if (server) { await server.close(); }
},);

afterEach(async () => {
  runtime?.registry.connection(PROFILE,)?.close();
  runtime = null;
  if (fixture) {
    await fixture.cleanup();
    fixture = null;
  }

  resetHarnessAdminSettings();
  resetExecLogPath();
  removeBuffer(SEED.chat.id,);
  if (execLogDir) {
    rmSync(execLogDir, { recursive: true, force: true, },);
    execLogDir = "";
  }
},);

/**
 * Read an SSE response until it carries the marker.
 * The turn's frames are buffered BEFORE the stream is opened, so the replay
 * arrives on the first reads — a hang here is a real failure, and bun's
 * per-test timeout is the bound (no timer of our own).
 * @param res - the open response
 * @param marker - the text that ends the read
 * @returns everything read so far
 */
async function readUntil(res: Response, marker: string,): Promise<string> {
  const body = res.body;
  if (!body) { throw new Error("SSE response carried no body",); }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (!text.includes(marker,)) {
      const chunk = await reader.read();
      if (chunk.done) { break; }
      text += decoder.decode(chunk.value, { stream: true, },);
    }
  } finally {
    await reader.cancel();
  }

  return text;
}

describe("Harness turn e2e — chat SSE stream", () => {
  test("a dispatched harness turn reaches the chat stream as SSE frames", async () => {
    fixture = await createHarnessFixture({
      server: { FAKE_MODELS: MODEL, FAKE_REPLY: REPLY, FAKE_STOP: "end_turn", },
    },);

    const acp: HarnessAcpConfig = {
      enabled: true,
      profiles: [{
        name: PROFILE,
        command: fixture.server.argv,
        tiers: { fast: { model: MODEL, capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },],
    };

    initHarnessAdminSettings(acp,);
    runtime = createHarnessRuntime({ acp, },);
    // The exec log is a file write — keep it out of the worktree.
    execLogDir = mkdtempSync(join(tmpdir(), "harness-sse-exec-",),);
    setExecLogPath(join(execLogDir, "executions.jsonl",),);

    // The chat's live buffer — the turn's frames ride it (turn-sink → turn-sse).
    // Start from an empty buffer: a buffer left by another file would replay
    // its events into this stream.
    removeBuffer(SEED.chat.id,);
    getOrCreateBuffer(SEED.chat.id,);

    const outcome = await dispatchHarnessTurn({
      runtime,
      role: "admin",
      userId: SEED.admin.id,
      profile: PROFILE,
      prompt: "say something",
      database: server.db,
      chatId: SEED.chat.id,
      actorId: SEED.character.id,
    },);

    // The turn landed in the chat as an assistant row.
    const rows = await server.db
      .selectFrom("messages",)
      .selectAll()
      .where("chat_id", "=", SEED.chat.id,)
      .where("id", "=", outcome.messageId,)
      .execute();

    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.id,).toBe(outcome.messageId,);
    expect(rows[0]?.role,).toBe("assistant",);

    // The chat's stream carries the turn's frames.
    const res = await fetch(`${server.url}/api/v1/generation/stream/${SEED.chat.id}`, {
      headers: {
        Accept: "text/event-stream",
        Cookie: `ll_token=${api.token};`,
      },
    },);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toContain("text/event-stream",);

    const sse = await readUntil(res, "event: harness-turn-end",);
    expect(sse,).toContain(`event: harness-chunk\ndata: {"text":"${REPLY}"}`,);
    expect(sse,).toContain("event: harness-turn-end",);
    expect(sse,).toContain(`"messageId":"${outcome.messageId}"`,);
    expect(sse,).toContain('"stopReason":"end_turn"',);

    // Default-deny at the stream's entry point: the same read without a
    // session is refused, and the harness payload never reaches it.
    const anonymous = await fetch(`${server.url}/api/v1/generation/stream/${SEED.chat.id}`, {
      headers: { Accept: "text/event-stream", },
    },);

    expect(anonymous.status,).toBe(401,);
    expect(await anonymous.text(),).not.toContain("harness-chunk",);
  });

  test("leaves the harness switch off for the files that follow", () => {
    // The admin-settings store is process-global: a file that left the ACP
    // switch on would widen every later file's dispatch rights.
    const verdict = assertHarnessExecution({
      config: { acp: getHarnessAdminFileConfig(), },
      role: "admin",
      userId: SEED.admin.id,
      profileName: PROFILE,
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "harness_disabled", },);
  });
});

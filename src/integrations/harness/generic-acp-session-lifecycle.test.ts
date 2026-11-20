// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ACP session lifecycle: MCP handoff, fs/write_text_file, list/resume/load,
 * set_mode, and additionalDirectories — against the fake ACP fixture.
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) and a fresh
 * adapter; both reaped in afterEach including failure paths. The fixture log
 * is read before the server is stopped (stop removes its directory). Temp
 * dirs are per-test and removed in afterEach; the additional-directories
 * roots additionally remove themselves in a `finally`. No sleeps — every
 * assertion synchronizes on a resolved adapter promise.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { resetHarnessAdminSettings, } from "./admin-settings";
import { type FakeAcpLogEntry, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { type GenericAcpOptions, resolveAdditionalDirectories, } from "./generic-acp";
import { OmpAcpAdapter, } from "./omp";
import { createHarnessRuntime, type HarnessRuntime, writeSandboxedText, } from "./runtime";
import { HarnessSessionStore, } from "./session-store";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: OmpAcpAdapter[] = [];
/** Temp dirs created by the current test; removed after each. */
const dirs: string[] = [];
/** Runtimes composed by the current test; connections closed after each. */
const runtimes: HarnessRuntime[] = [];

/** Per-request timeout for success paths (survives loaded parallel runners). */
const LIVE_TIMEOUT_MS = 4000;

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter on the fixture and register it for teardown. */
function makeAdapter(server: FakeAcpServer, options?: Partial<GenericAcpOptions>,): OmpAcpAdapter {
  const adapter = new OmpAcpAdapter({ requestTimeoutMs: LIVE_TIMEOUT_MS, ...options, command: server.argv, },);
  adapters.push(adapter,);
  return adapter;
}

/** A temp dir removed after the test. */
function tempDir(prefix: string,): string {
  const dir = mkdtempSync(join(tmpdir(), prefix,),);
  dirs.push(dir,);
  return dir;
}

/** The session/new params the fixture observed. */
function sessionNewParams(log: FakeAcpLogEntry[],): Record<string, unknown> | undefined {
  return log.find((item,): item is Extract<FakeAcpLogEntry, { event: "session_new" }> => item.event === "session_new")
    ?.params;
}

beforeEach(() => {
  resetHarnessAdminSettings();
},);

afterEach(() => {
  resetHarnessAdminSettings();
  for (const runtime of runtimes.splice(0,)) {
    runtime.registry.connection("p",)?.close();
  }

  while (adapters.length > 0) { adapters.pop()?.close(); }
  while (live.length > 0) { live.pop()?.stop(); }
  while (dirs.length > 0) { rmSync(dirs.pop()!, { recursive: true, force: true, },); }
},);

describe("session/new MCP handoff (fake ACP fixture)", () => {
  it("carries configured MCP servers verbatim", async () => {
    const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
    const mcpServers = [{
      name: "loop-lore",
      command: "loop-lore-mcp",
      args: ["--stdio",],
      env: [{ name: "LOOP_LORE_KEY", value: "test", },],
    },];

    const adapter = makeAdapter(server, { mcpServers, },);

    await adapter.enumerateModels();

    expect(sessionNewParams(server.readLog(),)?.mcpServers,).toEqual(mcpServers,);
  });

  it("sends an empty server list without configured servers", async () => {
    const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
    const adapter = makeAdapter(server,);

    await adapter.enumerateModels();

    expect(sessionNewParams(server.readLog(),)?.mcpServers,).toEqual([],);
  });
});

describe("fs/write_text_file bridge (fake ACP fixture)", () => {
  it("writes through the injected writer and answers the spec success shape", async () => {
    const root = tempDir("harness-acp-write-",);
    const file = join(root, "note.txt",);
    const server = serve({ FAKE_MODELS: "m", FAKE_WRITE_FILE: file, FAKE_WRITE_CONTENT: "hello", },);
    const adapter = makeAdapter(server, {
      writeTextFile: (path, content,) => writeSandboxedText(root, path, content,),
    },);

    await adapter.prompt("write it",);

    const entry = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, { event: "write_text" }> =>
      item.event === "write_text"
    );

    expect(entry?.path,).toBe(file,);
    expect(entry?.content,).toEqual({},);
    expect(readFileSync(file, "utf8",),).toBe("hello",);
  });

  it("refuses a write outside the sandbox root with a typed error", async () => {
    const root = tempDir("harness-acp-write-",);
    const outside = join(tempDir("harness-acp-outside-",), "secret.txt",);
    const server = serve({ FAKE_MODELS: "m", FAKE_WRITE_FILE: outside, FAKE_WRITE_CONTENT: "nope", },);
    const adapter = makeAdapter(server, {
      writeTextFile: (path, content,) => writeSandboxedText(root, path, content,),
    },);

    await adapter.prompt("write it",);

    const entry = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, { event: "write_text" }> =>
      item.event === "write_text"
    );

    expect(entry?.content,).toEqual({
      error: { code: -32000, message: "path is outside the sandbox root", },
    },);
  });
});

describe("HarnessSessionStore", () => {
  it("indexes sessions per profile in remember order", () => {
    const store = new HarnessSessionStore();
    store.remember("a", "s-1", "/a",);
    store.remember("a", "s-2", "/a2",);
    store.remember("b", "s-3", "/b",);

    expect(store.sessionsFor("a",),).toEqual([
      { sessionId: "s-1", cwd: "/a", },
      { sessionId: "s-2", cwd: "/a2", },
    ],);

    expect(store.sessionsFor("b",),).toEqual([{ sessionId: "s-3", cwd: "/b", },],);
    expect(store.sessionsFor("missing",),).toEqual([],);
  });

  it("lists every profile's sessions; re-remembering refreshes the cwd in place", () => {
    const store = new HarnessSessionStore();
    store.remember("a", "s-1", "/a",);
    store.remember("b", "s-2", "/b",);
    store.remember("a", "s-1", "/a-moved",);

    expect(store.list(),).toEqual([
      { profile: "a", sessionId: "s-1", cwd: "/a-moved", },
      { profile: "b", sessionId: "s-2", cwd: "/b", },
    ],);
  });
});

describe("session persistence (fake ACP fixture)", () => {
  it("session/list returns the harness's remembered sessions", async () => {
    const root = tempDir("harness-acp-list-",);
    const server = serve({ FAKE_MODELS: "m", FAKE_LIST_CWD: root, },);
    const adapter = makeAdapter(server,);

    await expect(adapter.listSessions(),).resolves.toEqual([{ sessionId: "fake-session-1", cwd: root, },],);
  });

  it("session/resume re-attaches without replay", async () => {
    const server = serve({ FAKE_MODELS: "m", },);
    const adapter = makeAdapter(server,);

    await adapter.resumeSession("remembered-9",);
    const turn = await adapter.prompt("again",);

    expect(turn.acpSessionId,).toBe("remembered-9",);
    expect(turn.text,).toBe("ok",);
  });

  it("session/load replays one chunk into the transcript", async () => {
    const server = serve({ FAKE_MODELS: "m", FAKE_REPLY: "replayed-history", },);
    const adapter = makeAdapter(server,);

    const transcript = await adapter.loadSession("remembered-9",);

    expect(transcript.text,).toBe("replayed-history",);
    expect(transcript.modes,).toEqual([],);
  });
});

describe("session/set_mode (fake ACP fixture)", () => {
  it("sends the profile-configured mode id and records the reply", async () => {
    const server = serve({ FAKE_MODELS: "m", },);
    const adapter = makeAdapter(server, { mode: "plan", },);

    const reply = await adapter.setMode();

    const entry = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, { event: "set_mode" }> =>
      item.event === "set_mode"
    );

    expect(entry?.modeId,).toBe("plan",);
    expect(reply,).toEqual({ currentModeId: "plan", },);
    expect(adapter.currentModeId(),).toBe("plan",);
  });

  it("prefers an explicit id over the configured default", async () => {
    const server = serve({ FAKE_MODELS: "m", },);
    const adapter = makeAdapter(server, { mode: "plan", },);

    await adapter.setMode("act",);

    const entry = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, { event: "set_mode" }> =>
      item.event === "set_mode"
    );

    expect(entry?.modeId,).toBe("act",);
    expect(adapter.currentModeId(),).toBe("act",);
  });

  it("surfaces a current_mode_update notification in the turn transcript", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_EVENTS: JSON.stringify([{ sessionUpdate: "current_mode_update", currentModeId: "plan", },],),
    },);

    const adapter = makeAdapter(server,);

    const turn = await adapter.prompt("hello",);

    expect(turn.transcript.modes,).toEqual(["plan",],);
  });
});

describe("additionalDirectories (fake ACP fixture)", () => {
  it("session/new sends the configured absolute roots", async () => {
    const first = tempDir("harness-acp-extra-a-",);
    const second = tempDir("harness-acp-extra-b-",);
    try {
      const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
      const adapter = makeAdapter(server, { additionalDirectories: [first, second,], },);

      await adapter.enumerateModels();

      expect(sessionNewParams(server.readLog(),)?.additionalDirectories,).toEqual([first, second,],);
    } finally {
      rmSync(first, { recursive: true, force: true, },);
      rmSync(second, { recursive: true, force: true, },);
    }
  });

  it("rejects a relative entry before the session/new request goes out", async () => {
    expect(() => resolveAdditionalDirectories(["rel/path",],)).toThrow(/absolute/,);

    const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
    const adapter = makeAdapter(server, { additionalDirectories: ["rel/path",], },);

    await expect(adapter.enumerateModels(),).rejects.toThrow(/absolute/,);
    const log = server.readLog();
    expect(log.some((item,) => item.event === "initialize"),).toBe(true,);
    expect(log.some((item,) => item.event === "session_new"),).toBe(false,);
  });
});

describe("runtime-composed session lifecycle (fake ACP fixture)", () => {
  it("hands configured servers, roots, and the write bridge to the agent", async () => {
    const root = tempDir("harness-acp-sandbox-",);
    const extra = tempDir("harness-acp-extra-",);
    const target = join(root, "agent.txt",);
    const mcpServers = [{ name: "loop-lore", command: "loop-lore-mcp", },];
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_LOG_PARAMS: "1",
      FAKE_WRITE_FILE: target,
      FAKE_WRITE_CONTENT: "composed",
    },);

    const runtime = createHarnessRuntime({
      acp: {
        enabled: true,
        profiles: [{
          name: "p",
          command: server.argv,
          tiers: {},
          sandboxRoot: root,
          mcpServers,
          additionalDirectories: [extra,],
          mode: "plan",
        },],
      },
    },);

    runtimes.push(runtime,);

    await runtime.registry.ensureProbed("p",);
    await runtime.registry.connection("p",)?.prompt("go",);

    const params = sessionNewParams(server.readLog(),);
    expect(params?.mcpServers,).toEqual(mcpServers,);
    expect(params?.additionalDirectories,).toEqual([extra,],);
    expect(readFileSync(target, "utf8",),).toBe("composed",);
  });
});

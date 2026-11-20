// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 300

/**
 * Fake ACP server fixture (test-only; imported exclusively by *.test.ts).
 *
 * Writes a plain-JS NDJSON JSON-RPC script answering `initialize`,
 * `session/new` (canned MODEL_CONFIG_ID options), `session/set_config_option`,
 * `session/set_mode` (echoes `currentModeId`), `session/list`, `session/resume`
 * and `session/load` (replays one chunk), `session/prompt` (chunk notification
 * + stopReason/usage), `session/cancel`, and — server-originated, mid-prompt
 * — `session/request_permission`, `elicitation/create`, `fs/read_text_file`
 * and `fs/write_text_file` client requests; `_omp/usage` answers quota probes.
 * `session/delete` answers the v2-only delete method.
 * Behavior is tuned through environment variables read at spawn time.
 *
 * The child appends one JSON line per observed client reaction (a cancel, a
 * permission outcome, an fs-read response) to `acp-log.jsonl` next to its
 * script; with FAKE_LOG_PARAMS it logs the initialize and session/new params
 * as well. `FakeAcpServer.readLog()` parses it, so tests assert what the
 * client actually sent back across the wire.
 *
 * Resource contract: ONE child process per test; the returned `stop()` (and
 * the afterEach teardown) kills it. Tests stay parallel-safe — no shared
 * ports, paths, or module state. Read the log BEFORE `stop()`: it removes
 * the temp dir holding both script and log.
 */

import { type ChildProcess, spawn, } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { safeJsonParse, safeJsonStringify, } from "../../utils";

/** Observation-log file name; the child writes it next to its own script. */
const LOG_FILENAME = "acp-log.jsonl";

/** The fake server script, as it runs in the child. */
const SCRIPT = String.raw`
const models = (process.env.FAKE_MODELS ?? "").split(",").filter(Boolean);
const permKinds = (process.env.FAKE_PERMISSION_KINDS ?? "allow_once,reject_once").split(",");
const configId = process.env.FAKE_CONFIG_ID ?? "MODEL_CONFIG_ID";
const rejectModel = process.env.FAKE_REJECT_MODEL ?? "";
const fsmod = require("node:fs");
const pathmod = require("node:path");
const logPath = pathmod.join(__dirname, "${LOG_FILENAME}");
const logEvent = (o) => { try { fsmod.appendFileSync(logPath, JSON.stringify(o) + "\n"); } catch {} };
let buf = "";
let serverReqId = 1000;
let activeSession = "fake-session-1";
const clientResolvers = new Map();
let cancelWaiter = null;
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const askClientBurst = (entries) => {
  const promises = [];
  const lines = [];
  for (const entry of entries) {
    serverReqId += 1;
    const id = serverReqId;
    promises.push(new Promise((resolve) => { clientResolvers.set(id, { resolve: resolve, method: entry.method, params: entry.params }); }));
    lines.push(JSON.stringify({ jsonrpc: "2.0", id: id, method: entry.method, params: entry.params }));
  }
  process.stdout.write(lines.join("\n") + "\n");
  return promises;
};
const runPromptFlow = async (promptId) => {
  let cancelPromise = null;
  if (process.env.FAKE_AWAIT_CANCEL) {
    cancelPromise = new Promise((resolve) => { cancelWaiter = resolve; });
  }
  if (process.env.FAKE_PERMISSION) {
    const options = process.env.FAKE_PERMISSION_NO_OPTIONS ? [] : [
      { optionId: "allow", name: "Allow", kind: permKinds[0] ?? "allow_once" },
      { optionId: "reject", name: "Reject", kind: permKinds[1] ?? "reject_once" },
    ];
    const askParams = (callId) => ({ sessionId: process.env.FAKE_ASK_SESSION_ID ?? activeSession, toolCall: { toolCallId: callId, title: "Edit file", kind: "edit", status: "pending" }, options: options });
    const entries = [{ method: "session/request_permission", params: askParams("call-1") }];
    if (process.env.FAKE_PERMISSION_TWICE) { entries.push({ method: "session/request_permission", params: askParams("call-2") }); }
    await Promise.all(askClientBurst(entries,));
  }
  if (process.env.FAKE_ELICITATION) {
    const elicMode = process.env.FAKE_ELICITATION;
    const elicParams = elicMode === "form"
      ? { sessionId: process.env.FAKE_ASK_SESSION_ID ?? activeSession, mode: "form", message: "Pick a strategy", requestedSchema: { type: "object", properties: { strategy: { type: "string", enum: ["conservative", "balanced"] } }, required: ["strategy"] } }
      : { sessionId: process.env.FAKE_ASK_SESSION_ID ?? activeSession, mode: elicMode, elicitationId: "elic-1", url: "https://example.com/connect?elicitationId=elic-1", message: "Authorize access." };
    await Promise.all(askClientBurst([{ method: "elicitation/create", params: elicParams },],),);
  }
  if (process.env.FAKE_READ_FILE) {
    const readParams = { sessionId: process.env.FAKE_ASK_SESSION_ID ?? activeSession, path: process.env.FAKE_READ_FILE };
    if (process.env.FAKE_READ_FILE_LINE) { readParams.line = Number(process.env.FAKE_READ_FILE_LINE); }
    if (process.env.FAKE_READ_FILE_LIMIT) { readParams.limit = Number(process.env.FAKE_READ_FILE_LIMIT); }
    await Promise.all(askClientBurst([{ method: "fs/read_text_file", params: readParams },],),);
  }
  if (process.env.FAKE_WRITE_FILE) {
    const writeParams = { sessionId: process.env.FAKE_ASK_SESSION_ID ?? activeSession, path: process.env.FAKE_WRITE_FILE, content: process.env.FAKE_WRITE_CONTENT ?? "" };
    await Promise.all(askClientBurst([{ method: "fs/write_text_file", params: writeParams },],),);
  }
  if (cancelPromise) { await cancelPromise; cancelWaiter = null; }
  if (process.env.FAKE_EVENTS) {
    for (const update of JSON.parse(process.env.FAKE_EVENTS)) {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: activeSession, update } });
    }
  }
  send({ jsonrpc: "2.0", method: "session/update", params: {
    sessionId: activeSession,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: process.env.FAKE_REPLY ?? "ok" } },
  } });
  const stop = process.env.FAKE_STOP ?? (process.env.FAKE_AWAIT_CANCEL ? "cancelled" : "end_turn");
  const result = { stopReason: stop };
  if (!process.env.FAKE_NO_USAGE) { result.usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 }; }
  send({ jsonrpc: "2.0", id: promptId, result });
  if (process.env.FAKE_LATE_USAGE) {
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: activeSession,
      update: JSON.parse(process.env.FAKE_LATE_USAGE),
    } });
  }
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.id !== undefined && clientResolvers.has(m.id)) {
      const entry = clientResolvers.get(m.id);
      clientResolvers.delete(m.id);
      const payload = m.error ? { error: m.error } : m.result;
      if (entry.method === "fs/read_text_file") {
        logEvent({ event: "read_text", path: entry.params.path, content: payload });
      } else if (entry.method === "fs/write_text_file") {
        logEvent({ event: "write_text", path: entry.params.path, content: payload });
      } else {
        logEvent({ event: "permission_outcome", outcome: payload });
      }
      entry.resolve(payload);
      continue;
    }
    if (m.method === "initialize") {
      if (process.env.FAKE_LOG_PARAMS) { logEvent({ event: "initialize", params: m.params }); }
      if (process.env.FAKE_HANG) { continue; }
      if (process.env.FAKE_MALFORMED) { process.stdout.write("this is not json\n{broken\n"); continue; }
      const initResult = { protocolVersion: process.env.FAKE_PROTOCOL_VERSION ? Number(process.env.FAKE_PROTOCOL_VERSION) : 1, agentInfo: { name: "fake" } };
      if (process.env.FAKE_CAPABILITIES) { initResult.capabilities = JSON.parse(process.env.FAKE_CAPABILITIES); }
      send({ jsonrpc: "2.0", id: m.id, result: initResult });
    } else if (m.method === "session/new") {
      if (process.env.FAKE_LOG_PARAMS) { logEvent({ event: "session_new", params: m.params }); }
      if (process.env.FAKE_NO_SESSION) {
        send({ jsonrpc: "2.0", id: m.id, result: {} });
        continue;
      }
      if (process.env.FAKE_MODELS_FIELD) {
        send({ jsonrpc: "2.0", id: m.id, result: {
          sessionId: "fake-session-1",
          models: { availableModels: models.map((v) => ({ modelId: v, name: v })), currentModelId: models[0] ?? "" },
        } });
        continue;
      }
      send({ jsonrpc: "2.0", id: m.id, result: {
        sessionId: "fake-session-1",
        configOptions: [{ id: configId, name: "Model", type: "select", currentValue: models[0] ?? "", options: models.map((v) => ({ value: v })) }],
      } });
    } else if (m.method === "unstable_setSessionModel") {
      if (rejectModel && m.params.modelId === rejectModel) {
        send({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "Unknown model " + m.params.modelId } });
      } else {
        send({ jsonrpc: "2.0", id: m.id, result: {} });
      }
    } else if (m.method === "session/set_session_model") {
      if (rejectModel && m.params.modelId === rejectModel) {
        send({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "Unknown model " + m.params.modelId } });
      } else {
        send({ jsonrpc: "2.0", id: m.id, result: {} });
      }
    } else if (m.method === "session/set_config_option") {
      if (rejectModel && m.params.value === rejectModel) {
        send({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "Unknown ACP model " + m.params.value } });
      } else {
        send({ jsonrpc: "2.0", id: m.id, result: { configOptions: [] } });
      }
    } else if (m.method === "session/set_mode") {
      logEvent({ event: "set_mode", modeId: typeof m.params?.modeId === "string" ? m.params.modeId : null });
      send({ jsonrpc: "2.0", id: m.id, result: { currentModeId: m.params?.modeId ?? null } });
    } else if (m.method === "session/list") {
      send({ jsonrpc: "2.0", id: m.id, result: {
        sessions: [{ sessionId: "fake-session-1", cwd: process.env.FAKE_LIST_CWD ?? null }],
      } });
    } else if (m.method === "session/resume") {
      activeSession = typeof m.params?.sessionId === "string" && m.params.sessionId !== "" ? m.params.sessionId : activeSession;
      send({ jsonrpc: "2.0", id: m.id, result: {
        sessionId: activeSession,
        configOptions: [{ id: configId, name: "Model", type: "select", currentValue: models[0] ?? "", options: models.map((v) => ({ value: v })) }],
      } });
    } else if (m.method === "session/load") {
      activeSession = typeof m.params?.sessionId === "string" && m.params.sessionId !== "" ? m.params.sessionId : activeSession;
      send({ jsonrpc: "2.0", method: "session/update", params: {
        sessionId: activeSession,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: process.env.FAKE_REPLY ?? "ok" } },
      } });
      send({ jsonrpc: "2.0", id: m.id, result: {
        sessionId: activeSession,
        configOptions: [{ id: configId, name: "Model", type: "select", currentValue: models[0] ?? "", options: models.map((v) => ({ value: v })) }],
      } });
    } else if (m.method === "session/delete") {
      logEvent({ event: "delete_session", sessionId: typeof m.params?.sessionId === "string" ? m.params.sessionId : null });
      send({ jsonrpc: "2.0", id: m.id, result: {} });
    } else if (m.method === "session/prompt") {
      if (process.env.FAKE_EXIT_ON_PROMPT && m.params.prompt?.[0]?.text === process.env.FAKE_EXIT_ON_PROMPT) {
        process.exit(1);
      }
      runPromptFlow(m.id);
    } else if (m.method === "session/cancel") {
      logEvent({ event: "cancel", sessionId: typeof (m.params ?? {}).sessionId === "string" ? m.params.sessionId : null });
      if (cancelWaiter) { const wake = cancelWaiter; cancelWaiter = null; wake(); }
      if (m.id !== undefined) { send({ jsonrpc: "2.0", id: m.id, result: {} }); }
    } else if (m.method === "_omp/usage") {
      send({ jsonrpc: "2.0", id: m.id, result: { reports: process.env.FAKE_USAGE ? JSON.parse(process.env.FAKE_USAGE) : [] } });
    } else if (m.id !== undefined) {
      send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found: " + m.method } });
    }
  }
});
`;

/** Tunables for one fake server instance. */
export interface FakeAcpEnv {
  /** Comma-separated advertised model ids. */
  FAKE_MODELS?: string;
  /** Model id `session/set_config_option` must reject. */
  FAKE_REJECT_MODEL?: string;
  /** agent_message_chunk reply text. */
  FAKE_REPLY?: string;
  /** stopReason for session/prompt. */
  FAKE_STOP?: string;
  /** JSON array of usage reports for `_omp/usage`. */
  FAKE_USAGE?: string;
  /** Config option id of the model select (default omp's `MODEL_CONFIG_ID`). */
  FAKE_CONFIG_ID?: string;
  /** When set, session/new answers without a sessionId. */
  FAKE_NO_SESSION?: string;
  /** claude-code flavor: session/new carries the non-standard `models` field. */
  FAKE_MODELS_FIELD?: string;
  /** When set, initialize is never answered (requests hang until timeout). */
  FAKE_HANG?: string;
  /** When set, garbage lines precede a never-answered initialize. */
  FAKE_MALFORMED?: string;
  /** Prompt TEXT that makes the child exit code=1 (matching prompts only). */
  FAKE_EXIT_ON_PROMPT?: string;
  /** `elicitation/create` mode the prompt sends and awaits (`form` or `url`); unset sends none. */
  FAKE_ELICITATION?: string;
  /** When set, session/prompt first sends `session/request_permission` and awaits the client's outcome. */
  FAKE_PERMISSION?: string;
  /** When set, the prompt response omits `usage` (the stable ACP v1 PromptResponse shape). */
  FAKE_NO_USAGE?: string;
  /** Comma-separated kinds of the advertised permission options (allow, reject). */
  FAKE_PERMISSION_KINDS?: string;
  /** When set, the permission ask advertises NO options (nothing to select). */
  FAKE_PERMISSION_NO_OPTIONS?: string;
  /** When set, the asks name this session id instead of the fixture's own. */
  FAKE_ASK_SESSION_ID?: string;
  /** When set, the prompt sends a SECOND permission ask while the first is open. */
  FAKE_PERMISSION_TWICE?: string;
  /** When set, the fixture logs the initialize and session/new params it observed. */
  FAKE_LOG_PARAMS?: string;
  /** When set, session/prompt first asks the client to read this path via `fs/read_text_file`. */
  FAKE_READ_FILE?: string;
  /** 1-based first line the `fs/read_text_file` ask requests. */
  FAKE_READ_FILE_LINE?: string;
  /** Maximum number of lines the `fs/read_text_file` ask requests. */
  FAKE_READ_FILE_LIMIT?: string;
  /** JSON `usage_update` payload the child sends AFTER the prompt response. */
  FAKE_LATE_USAGE?: string;
  /** When set, the session/prompt reply waits for `session/cancel`; stopReason then defaults to "cancelled". */
  FAKE_AWAIT_CANCEL?: string;
  /** JSON array of ACP `session/update` payloads emitted before the reply chunk. */
  FAKE_EVENTS?: string;
  /** When set, session/prompt first asks the client to write this path via `fs/write_text_file`. */
  FAKE_WRITE_FILE?: string;
  /** Content the `fs/write_text_file` ask carries. */
  FAKE_WRITE_CONTENT?: string;
  /** cwd `session/list` reports for the remembered session; absent = null. */
  FAKE_LIST_CWD?: string;
  /** protocolVersion the fake agent selects at initialize (default 1). */
  FAKE_PROTOCOL_VERSION?: string;
  /** JSON agent capabilities object included in the initialize result. */
  FAKE_CAPABILITIES?: string;
}

/** One observed client reaction, as logged by the fixture child. */
export type FakeAcpLogEntry =
  | { event: "cancel"; sessionId: string | null }
  | { event: "permission_outcome"; outcome: unknown }
  | { event: "read_text"; path: string; content: unknown }
  | { event: "write_text"; path: string; content: unknown }
  | { event: "set_mode"; modeId: string | null }
  | { event: "delete_session"; sessionId: string | null }
  | { event: "initialize"; params: Record<string, unknown> }
  | { event: "session_new"; params: Record<string, unknown> };

/** Event discriminators `readLog` accepts. */
const LOG_EVENTS = new Set([
  "cancel",
  "permission_outcome",
  "read_text",
  "write_text",
  "set_mode",
  "delete_session",
  "initialize",
  "session_new",
],);

/** Narrow a parsed log line to a known event shape. */
function isLogEntry(value: unknown,): value is FakeAcpLogEntry {
  if (typeof value !== "object" || value === null) { return false; }
  const event = (value as { event?: unknown }).event;
  return typeof event === "string" && LOG_EVENTS.has(event,);
}

/** A started fake server; `argv` feeds a profile command, `stop()` reaps it. */
export interface FakeAcpServer {
  /** Spawn argv for the profile command. */
  argv: string[];
  /**
   * Parse the observation log the child appends next to its script.
   * @returns entries in child write order; empty when nothing was logged.
   * Call before `stop()` — it removes the log's directory.
   */
  readLog(): FakeAcpLogEntry[];
  /** Kill the child and remove the temp dir. Idempotent. */
  stop(): void;
}

/**
 * Start one fake ACP server as a child process.
 * @param env - behavior tunables (read once at spawn)
 * @returns the server handle; caller MUST `stop()` it.
 * @throws {Error} when the temp dir cannot be created.
 */
export function startFakeAcp(env: FakeAcpEnv,): FakeAcpServer {
  const dir = mkdtempSync(join(tmpdir(), "fake-acp-",),);
  const script = join(dir, "fake-acp.cjs",);
  const logPath = join(dir, LOG_FILENAME,);
  // Behavior rides the SCRIPT FILE, not the spawning process's env: the
  // adapter spawns its own child from `argv`, which inherits nothing.
  const prelude = Object.entries(env,)
    .map(([k, v,],) => {
      const key = safeJsonStringify(k,);
      const value = safeJsonStringify(v,);
      return key.ok && value.ok ? `process.env[${key.value}] = ${value.value};` : "";
    },)
    .join("\n",);

  writeFileSync(script, prelude + "\n" + SCRIPT,);
  let child: ChildProcess | null = spawn(process.execPath, [script,], {
    env: { ...process.env, ...env, },
    stdio: ["pipe", "pipe", "pipe",],
  },);

  return {
    argv: [process.execPath, script,],
    readLog(): FakeAcpLogEntry[] {
      let text: string;
      try {
        text = readFileSync(logPath, "utf8",);
      } catch {
        return []; // No child has logged yet — an empty log is the fresh-fixture norm.
      }

      return text.split("\n",).flatMap((line,): FakeAcpLogEntry[] => {
        if (line.trim() === "") { return []; }
        const parsed = safeJsonParse<FakeAcpLogEntry>(line,);
        return parsed.ok && isLogEntry(parsed.value,) ? [parsed.value,] : [];
      },);
    },
    stop(): void {
      child?.kill("SIGKILL",);
      child = null;
      rmSync(dir, { recursive: true, force: true, },);
    },
  };
}

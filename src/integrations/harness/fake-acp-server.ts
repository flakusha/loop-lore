// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fake ACP server fixture (test-only; imported exclusively by *.test.ts).
 *
 * Writes a plain-JS NDJSON JSON-RPC script answering `initialize`,
 * `session/new` (canned MODEL_CONFIG_ID options), `session/set_config_option`,
 * `session/prompt` (chunk notification + stopReason/usage), `session/cancel`,
 * and — server-originated, mid-prompt — `session/request_permission` and
 * `fs/read_text_file` client requests; `_omp/usage` answers quota probes.
 * Behavior is tuned through environment variables read at spawn time.
 *
 * The child appends one JSON line per observed client reaction (a cancel, a
 * permission outcome, an fs-read response) to `acp-log.jsonl` next to its
 * script; `FakeAcpServer.readLog()` parses it, so tests assert what the
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
const configId = process.env.FAKE_CONFIG_ID ?? "MODEL_CONFIG_ID";
const rejectModel = process.env.FAKE_REJECT_MODEL ?? "";
const fsmod = require("node:fs");
const pathmod = require("node:path");
const logPath = pathmod.join(__dirname, "${LOG_FILENAME}");
const logEvent = (o) => { try { fsmod.appendFileSync(logPath, JSON.stringify(o) + "\n"); } catch {} };
let buf = "";
let serverReqId = 1000;
const clientResolvers = new Map();
let cancelWaiter = null;
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const askClient = (method, params) => new Promise((resolve) => {
  serverReqId += 1;
  clientResolvers.set(serverReqId, { resolve: resolve, method: method, params: params });
  send({ jsonrpc: "2.0", id: serverReqId, method: method, params: params });
});
const runPromptFlow = async (promptId) => {
  let cancelPromise = null;
  if (process.env.FAKE_AWAIT_CANCEL) {
    cancelPromise = new Promise((resolve) => { cancelWaiter = resolve; });
  }
  if (process.env.FAKE_PERMISSION) {
    await askClient("session/request_permission", {
      sessionId: "fake-session-1",
      kind: "edit",
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ],
    });
  }
  if (process.env.FAKE_READ_FILE) {
    await askClient("fs/read_text_file", { sessionId: "fake-session-1", path: process.env.FAKE_READ_FILE });
  }
  if (cancelPromise) { await cancelPromise; cancelWaiter = null; }
  send({ jsonrpc: "2.0", method: "session/update", params: {
    sessionId: "fake-session-1",
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: process.env.FAKE_REPLY ?? "ok" } },
  } });
  const stop = process.env.FAKE_STOP ?? (process.env.FAKE_AWAIT_CANCEL ? "cancelled" : "end_turn");
  send({ jsonrpc: "2.0", id: promptId, result: {
    stopReason: stop,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  } });
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
      } else {
        logEvent({ event: "permission_outcome", outcome: payload });
      }
      entry.resolve(payload);
      continue;
    }
    if (m.method === "initialize") {
      if (process.env.FAKE_HANG) { continue; }
      if (process.env.FAKE_MALFORMED) { process.stdout.write("this is not json\n{broken\n"); continue; }
      send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1, agentInfo: { name: "fake" } } });
    } else if (m.method === "session/new") {
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
        configOptions: [{ id: configId, type: "select", currentValue: models[0] ?? "", options: models.map((v) => ({ value: v })) }],
      } });
    } else if (m.method === "unstable_setSessionModel") {
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
  /** When set, session/prompt first sends `session/request_permission` and awaits the client's outcome. */
  FAKE_PERMISSION?: string;
  /** When set, session/prompt first asks the client to read this path via `fs/read_text_file`. */
  FAKE_READ_FILE?: string;
  /** When set, the session/prompt reply waits for `session/cancel`; stopReason then defaults to "cancelled". */
  FAKE_AWAIT_CANCEL?: string;
}

/** One observed client reaction, as logged by the fixture child. */
export type FakeAcpLogEntry =
  | { event: "cancel"; sessionId: string | null }
  | { event: "permission_outcome"; outcome: unknown }
  | { event: "read_text"; path: string; content: unknown };

/** Event discriminators `readLog` accepts. */
const LOG_EVENTS = new Set(["cancel", "permission_outcome", "read_text",],);

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

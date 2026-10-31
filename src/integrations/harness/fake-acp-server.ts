// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fake ACP server fixture (test-only; imported exclusively by *.test.ts).
 *
 * Writes a plain-JS NDJSON JSON-RPC script answering `initialize`,
 * `session/new` (canned MODEL_CONFIG_ID options), `session/set_config_option`,
 * `session/prompt` (chunk notification + stopReason/usage) and `_omp/usage`;
 * behavior is tuned through environment variables read at spawn time.
 *
 * Resource contract: ONE child process per test; the returned `stop()` (and
 * the afterEach teardown) kills it. Tests stay parallel-safe — no shared
 * ports, paths, or module state.
 */

import { type ChildProcess, spawn, } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { safeJsonStringify, } from "../../utils";

/** The fake server script, as it runs in the child. */
const SCRIPT = String.raw`
const models = (process.env.FAKE_MODELS ?? "").split(",").filter(Boolean);
const rejectModel = process.env.FAKE_REJECT_MODEL ?? "";
let buf = "";
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
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
    if (m.method === "initialize") {
      send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1, agentInfo: { name: "fake" } } });
    } else if (m.method === "session/new") {
      send({ jsonrpc: "2.0", id: m.id, result: {
        sessionId: "fake-session-1",
        configOptions: [{ id: "MODEL_CONFIG_ID", type: "select", currentValue: models[0] ?? "", options: models.map((v) => ({ value: v })) }],
      } });
    } else if (m.method === "session/set_config_option") {
      if (rejectModel && m.params.value === rejectModel) {
        send({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "Unknown ACP model " + m.params.value } });
      } else {
        send({ jsonrpc: "2.0", id: m.id, result: { configOptions: [] } });
      }
    } else if (m.method === "session/prompt") {
      send({ jsonrpc: "2.0", method: "session/update", params: {
        sessionId: "fake-session-1",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: process.env.FAKE_REPLY ?? "ok" } },
      } });
      send({ jsonrpc: "2.0", id: m.id, result: {
        stopReason: process.env.FAKE_STOP ?? "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } });
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
}

/** A started fake server; `argv` feeds a profile command, `stop()` reaps it. */
export interface FakeAcpServer {
  /** Spawn argv for the profile command. */
  argv: string[];
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
    stop(): void {
      child?.kill("SIGKILL",);
      child = null;
      rmSync(dir, { recursive: true, force: true, },);
    },
  };
}

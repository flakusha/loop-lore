// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * JsonRpcProcess cancellation tests: `cancelRequest` rejects a held request
 * by id with the typed cancellation error, an inbound `$/cancel_request`
 * cancels the named pending request, and the transport answers the next
 * request afterwards.
 *
 * Resource contract (parallel-safe): every test owns a fresh transport over
 * an inline `node -e` child (no ports, no files, no shared state), reaped in
 * `afterEach`. The held-open request is released by the cancel under test —
 * never a sleep — so a cancelled test cannot time out.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import {
  JSON_RPC_CANCELLED_CODE,
  JsonRpcProcess,
  JsonRpcRequestCancelledError,
} from "./jsonrpc-process";

/**
 * The stub child: `blocked/wait` is held open forever, `trigger/cancel`
 * emits an inbound `$/cancel_request` for the held id before answering, and
 * any other request echoes its params.
 */
const HOLD_SCRIPT = String.raw`
let buf = "";
let held = null;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let newline;
  while ((newline = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, newline).trim();
    buf = buf.slice(newline + 1);
    if (!line) { continue; }
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === "blocked/wait") { held = msg.id; continue; }
    if (msg.method === "trigger/cancel") {
      if (held !== null) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "$/cancel_request", params: { id: held } }) + "\n");
        held = null;
      }
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }) + "\n");
      continue;
    }
    if (msg.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { echo: msg.params ?? {} } }) + "\n");
    }
  }
});
`;

/** Transports started by the current test; reaped after each. */
const live: JsonRpcProcess[] = [];

/** Start a transport over a fresh stub child; register it for teardown. */
function serve(): JsonRpcProcess {
  const transport = new JsonRpcProcess({
    command: [process.execPath, "-e", HOLD_SCRIPT,],
    requestTimeoutMs: 4000,
  },);

  live.push(transport,);
  return transport;
}

afterEach(() => {
  while (live.length > 0) { live.pop()?.close(); }
},);

describe("JsonRpcProcess request cancellation", () => {
  it("rejects a held request by id with the typed error and stays usable", async () => {
    const transport = serve();
    const pending = transport.request("blocked/wait", {},);
    const settled = pending.then(
      () => "fulfilled",
      (error: unknown,) => error,
    );

    const ids = transport.pendingIds();
    expect(ids,).toHaveLength(1,);
    expect(transport.cancelRequest(ids[0]!,),).toBe(true,);

    const error = await settled;
    expect(error,).toBeInstanceOf(JsonRpcRequestCancelledError,);
    expect((error as JsonRpcRequestCancelledError).code,).toBe(JSON_RPC_CANCELLED_CODE,);

    expect(transport.cancelRequest(999_999,),).toBe(false,);

    // The transport is reusable: the next request is answered, not dropped.
    await expect(transport.request("echo", { hello: "world", },),).resolves.toEqual({
      echo: { hello: "world", },
    },);
  });

  it("cancels the held request on an inbound $/cancel_request", async () => {
    const transport = serve();
    const held = transport.request("blocked/wait", {},);
    const settled = held.then(
      () => "fulfilled",
      (error: unknown,) => error,
    );

    // The child emits the cancel notification for the held id, then answers.
    await transport.request("trigger/cancel", {},);

    const error = await settled;
    expect(error,).toBeInstanceOf(JsonRpcRequestCancelledError,);
    expect((error as JsonRpcRequestCancelledError).code,).toBe(JSON_RPC_CANCELLED_CODE,);

    await expect(transport.request("echo", {},),).resolves.toEqual({ echo: {}, },);
  });
});

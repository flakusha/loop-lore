// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Child stderr is piped, never inherited. It must still be DRAINED: a child
 * that writes more than the pipe's ~64 KiB blocks before it can answer a
 * request, stalling every harness flavor. The stub writes 192 KiB to stderr
 * before it installs its stdin handler — the request only resolves when the
 * parent consumed the pipe.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { JsonRpcProcess, MAX_STDERR_TAIL_BYTES, } from "./jsonrpc-process";

const NOISY_CHILD = `
process.stderr.write("E".repeat(192 * 1024));
process.stdin.once("data", (line) => {
  const request = JSON.parse(String(line));
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { ok: true } }) + "\\n");
});
`;

let transport: JsonRpcProcess | null = null;

afterEach(() => {
  transport?.close();
  transport = null;
},);

describe("JsonRpcProcess stderr drain", () => {
  test("a noisy child still answers and its stderr tail stays bounded", async () => {
    transport = new JsonRpcProcess({
      command: [process.execPath, "-e", NOISY_CHILD,],
      requestTimeoutMs: 3000,
    },);

    await expect(transport.request("probe", {},),).resolves.toEqual({ ok: true, },);
    expect(transport.stderrTail().length,).toBeLessThanOrEqual(MAX_STDERR_TAIL_BYTES,);
    expect(transport.stderrTail().endsWith("E".repeat(32,),),).toBe(true,);
  });
});

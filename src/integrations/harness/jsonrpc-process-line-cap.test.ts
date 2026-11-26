// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Child stdout without a newline must not grow the connection buffer without
 * bound. The stub emits one overlong line immediately and stays alive.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  JsonRpcProcess,
  JsonRpcRequestError,
  MAX_JSONRPC_LINE_BYTES,
} from "./jsonrpc-process";

const HUGE_LINE_SCRIPT = `process.stdout.write("x".repeat(${MAX_JSONRPC_LINE_BYTES + 1024}));`;

let transport: JsonRpcProcess | null = null;

afterEach(() => {
  transport?.close();
  transport = null;
},);

describe("JsonRpcProcess NDJSON line cap", () => {
  test("rejects a pending request when the child emits an overlong line", async () => {
    const exits: string[] = [];
    transport = new JsonRpcProcess({
      command: [process.execPath, "-e", HUGE_LINE_SCRIPT,],
      requestTimeoutMs: 2000,
      onExit: (detail: string,) => {
        exits.push(detail,);
      },
    },);

    const error = await transport.request("probe", {},).then(
      () => null,
      (reason: unknown,) => reason,
    );

    expect(error,).toBeInstanceOf(JsonRpcRequestError,);
    expect((error as Error).message,).toContain("exceeds",);
    expect(exits.some((detail: string,) => detail.includes("exceeds",)),).toBe(true,);
  });
});

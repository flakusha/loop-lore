// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, it, } from "bun:test";
import { externalToolsSection, } from "../assistant/prompt/sections/external-tools";
import {
  createCtxCallTool,
  createRtkRunTool,
  CTX_CALL,
  CTX_TOOLS,
  ctxCallTool,
  EXTERNAL_TOOLS_ENV,
  externalToolsEnabled,
  MAX_EXTERNAL_OUTPUT_BYTES,
  RTK_RUN,
  RTK_SUBCOMMANDS,
  rtkRunTool,
} from "./external-tools";
import type { ExternalProcess, ExternalSpawnOptions, } from "./external-tools";

function stream(text: string,): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller,) {
      controller.enqueue(new TextEncoder().encode(text,),);
      controller.close();
    },
  },);
}

interface FakeOptions {
  stdout?: string;
  stderr?: string;
  code?: number;
}

function fakeSpawn(result: FakeOptions = {},) {
  let last: ExternalSpawnOptions | undefined;
  let killed = false;
  const spawn = (opts: ExternalSpawnOptions,): ExternalProcess => {
    last = opts;
    return {
      stdout: stream(result.stdout ?? "ok",),
      stderr: stream(result.stderr ?? "",),
      exited: Promise.resolve(result.code ?? 0,),
      kill: () => {
        killed = true;
      },
    };
  };

  return { spawn, calls: () => last, killed: () => killed, };
}

afterEach(() => {
  delete process.env[EXTERNAL_TOOLS_ENV];
},);

describe("external harness tools", () => {
  it("exports the registered definitions and allowlists", () => {
    expect(rtkRunTool.name,).toBe(RTK_RUN,);
    expect(ctxCallTool.name,).toBe(CTX_CALL,);
    expect(RTK_SUBCOMMANDS.has("run",),).toBe(false,);
    expect(CTX_TOOLS.has("ctx_execute",),).toBe(false,);
    expect(externalToolsSection.name,).toBe("externalTools",);
  });

  it("requires an explicit opt-in env flag", () => {
    expect(externalToolsEnabled({},),).toBe(false,);
    expect(externalToolsEnabled({ [EXTERNAL_TOOLS_ENV]: "true", },),).toBe(false,);
    expect(externalToolsEnabled({ [EXTERNAL_TOOLS_ENV]: "1", },),).toBe(true,);
  });

  it("refuses mutating rtk subcommands before spawning", async () => {
    const fake = fakeSpawn();
    const tool = createRtkRunTool({ spawn: fake.spawn, },);
    const result = await tool.handler({ argv: ["run", "rm", "-rf", "/",], },);
    expect(tool.name,).toBe(RTK_RUN,);
    expect(result.isError,).toBe(true,);
    expect(result.content,).toContain("not allowed",);
    expect(fake.calls(),).toBeUndefined();
  });

  it("runs read-only rtk commands with scrubbed env", async () => {
    process.env.AUTH_JWT_SECRET = "must-not-leak";
    const fake = fakeSpawn({ stdout: "src/a.ts\n", },);
    const tool = createRtkRunTool({ spawn: fake.spawn, cwd: "/repo", },);
    const result = await tool.handler({ argv: ["rg", "needle", "src",], },);
    expect(result.isError,).toBeUndefined();
    expect(result.content,).toBe("src/a.ts\n",);
    expect(fake.calls()?.cmd,).toEqual(["rtk", "rg", "needle", "src",],);
    expect(fake.calls()?.cwd,).toBe("/repo",);
    expect(fake.calls()?.env.AUTH_JWT_SECRET,).toBeUndefined();
    delete process.env.AUTH_JWT_SECRET;
  });

  it("builds the lean-ctx call argv and caps oversized output", async () => {
    const fake = fakeSpawn({ stdout: "x".repeat(MAX_EXTERNAL_OUTPUT_BYTES + 100,), },);
    const tool = createCtxCallTool({ spawn: fake.spawn, cwd: "/repo", },);
    const result = await tool.handler({
      tool: "ctx_read",
      args: { path: "src/a.ts", mode: "anchored", },
    },);

    expect(tool.name,).toBe(CTX_CALL,);
    expect(result.content.length,).toBe(MAX_EXTERNAL_OUTPUT_BYTES,);
    expect(result.metadata?.truncated,).toBe(true,);
    expect(fake.calls()?.cmd,).toEqual([
      "lean-ctx",
      "call",
      "ctx_read",
      "--project-root",
      "/repo",
      "--json",
      JSON.stringify({ path: "src/a.ts", mode: "anchored", },),
    ],);
  });

  it("rejects unlisted lean-ctx tools and non-object args", async () => {
    const fake = fakeSpawn();
    const tool = createCtxCallTool({ spawn: fake.spawn, },);
    const badTool = await tool.handler({ tool: "ctx_execute", args: {}, },);
    const badArgs = await tool.handler({ tool: "ctx_read", args: ["src/a.ts",], },);
    expect(badTool.isError,).toBe(true,);
    expect(badArgs.isError,).toBe(true,);
    expect(fake.calls(),).toBeUndefined();
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Enforcement test: `executePluginTool` guards path-bearing arguments against
 * the harness worktree scope (`src/harness/worktree-scope.ts`). Parallel-safe:
 * per-test tmpdir fixtures with afterEach cleanup.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import { executePluginTool, } from "./tool-executor";
import type { ToolDefinition, ToolExecutionContext, } from "./types";

describe("executePluginTool worktree scope guard", () => {
  let root = "";
  let outside = "";
  let fixture: TestDb | null = null;

  beforeEach(() => {
    root = mkdtempSync(join(process.cwd(), ".tmp", "executor-scope-",),);
    outside = mkdtempSync(join(tmpdir(), "executor-out-",),);
  },);

  afterEach(() => {
    rmSync(root, { recursive: true, force: true, },);
    rmSync(outside, { recursive: true, force: true, },);
    fixture = null;
  },);

  test("an outside-scope path arg is refused before the handler runs", async () => {
    const outsideFile = join(outside, "x.txt",);
    let handlerRan = false;
    const tool: ToolDefinition = {
      name: "snoop",
      description: "d",
      parameters: {},
      handler: async () => {
        handlerRan = true;
        return { content: "ran", };
      },
    };

    const result = await executePluginTool(tool, { path: outsideFile, },);

    expect(result.isError,).toBe(true,);
    expect(result.content,).toContain("resolves outside the worktree scope root",);
    expect(result.content,).toContain("requestRootChange",);
    expect(handlerRan,).toBe(false,);
  },);

  test("an inside-scope path arg reaches the handler untouched", async () => {
    writeFileSync(join(root, "in.txt",), "x",);
    const seen: Record<string, unknown> = {};
    const tool: ToolDefinition = {
      name: "reader",
      description: "d",
      parameters: {},
      handler: async (params) => {
        Object.assign(seen, params,);
        return { content: "ran", };
      },
    };

    const result = await executePluginTool(tool, { path: join(root, "in.txt",), },);

    expect(result.isError,).toBeUndefined();
    expect(seen["path"],).toBe(join(root, "in.txt",),);
  },);

  test("requestRootChange escalation lets the handler run and logs", async () => {
    const outsideFile = join(outside, "escalated.txt",);
    let handlerRan = false;
    const tool: ToolDefinition = {
      name: "writer",
      description: "d",
      parameters: {},
      handler: async () => {
        handlerRan = true;
        return { content: "ran", };
      },
    };

    fixture = await createTestDb();
    const ctx: ToolExecutionContext = {
      db: fixture.db,
      actorId: "actor-1",
      chatId: "chat-1",
      requestRootChange: true,
    };

    const result = await executePluginTool(tool, { file: outsideFile, }, ctx,);

    expect(result.isError,).toBeUndefined();
    expect(handlerRan,).toBe(true,);
  },);
});

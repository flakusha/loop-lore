// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/orchestrate`, `/workflowz`, `/omp` — harness verbs over the workflow engine.
 *
 * Covers the resolution rules (default workflow, explicit name, `list`, unknown,
 * unconfigured) and the session-lifecycle contract: one live run per chat, and a
 * write-through to the session store so the existing 24h TTL applies.
 */
import { beforeEach, describe, expect, mock, test, } from "bun:test";
import type { AssistantWorkflowConfig, } from "../../config/sections/templates";
import { ChatParticipantRole, } from "../../db/enums";
import { clearSessions, getSession, } from "../workflow-session";
import { type CommandContext, getCommand, getCommandRequirement, listCommands, } from "./registry";

const saved: { chatId: string; workflowId: string }[] = [];

// Override only `saveSession`; the real store module stays intact for
// `workflow.ts`, which imports the cancel/load helpers from it.
const realStore = await import("../workflow-session-store");
mock.module("../workflow-session-store", () => ({
  ...realStore,
  saveSession: async (db: unknown, chatId: string, session: { workflow: { id: string } },) => {
    void db;
    saved.push({ chatId, workflowId: session.workflow.id, },);
  },
}),);

await import("./harness-verbs");

function wf(id: string, name = id, description?: string,): AssistantWorkflowConfig {
  return {
    id,
    name,
    description,
    steps: [
      { id: "goal", name: "Goal", type: "text", formatTemplate: "Goal: {value}", },
    ],
    dispatch: { backend: "test", target: "/api/test", payloadTemplate: { prompt: "{prompt}", }, },
  };
}

const CONFIG = {
  templates: {
    workflows: {
      workflows: {
        "harness-orchestrate": wf("harness-orchestrate", "Orchestrate", "Fan out",),
        "harness-workflowz": wf("harness-workflowz", "Workflowz",),
        "harness-small-agent": wf("harness-small-agent", "Small Agent",),
        "custom-one": wf("custom-one", "Custom One", "A custom workflow",),
      },
    },
  },
} as unknown as CommandContext["config"];

function makeCtx(chatId = "chat-1",): CommandContext {
  return { chatId, config: CONFIG, db: {} as CommandContext["db"], };
}

let chatSeq = 0;

/** Run a verb in a fresh chat so the one-run-per-chat guard never leaks. */
async function run(verb: string, args: string[], chatId?: string,) {
  const handler = getCommand(verb,);
  if (!handler) { throw new Error(`${verb} not registered`,); }
  return await handler(args, makeCtx(chatId ?? `chat-${++chatSeq}`,),);
}

beforeEach(() => {
  clearSessions();
  saved.length = 0;
},);

describe("harness verb registration", () => {
  test("all three verbs register and are advertised", () => {
    for (const verb of ["orchestrate", "workflowz", "omp",]) {
      expect(getCommand(verb,),).toBeDefined();
      expect(listCommands(),).toContain(verb,);
    }
  });

  test("verbs require member, matching /workflow", () => {
    for (const verb of ["orchestrate", "workflowz", "omp",]) {
      expect(getCommandRequirement(verb,),).toBe(ChatParticipantRole.Member,);
    }

    expect(getCommandRequirement("workflow",),).toBe(ChatParticipantRole.Member,);
  });
});

describe("workflow resolution", () => {
  test("no args starts the verb's default workflow", async () => {
    const out = await run("orchestrate", [],);
    expect(out.handled,).toBe(true,);
    expect(out.action,).toBe("workflow-start",);
    expect(out.actionPayload?.workflowId,).toBe("harness-orchestrate",);
    expect(out.systemMessage,).toContain("Orchestrate",);
    expect(out.systemMessage,).toContain("Goal",);
  });

  test("each verb defaults to its own workflow", async () => {
    expect((await run("workflowz", [],)).actionPayload?.workflowId,).toBe("harness-workflowz",);
    expect((await run("omp", [],)).actionPayload?.workflowId,).toBe("harness-small-agent",);
  });

  test("an explicit workflow id or display name wins, case-insensitively", async () => {
    expect((await run("workflowz", ["custom-one",],)).actionPayload?.workflowId,).toBe("custom-one",);
    expect((await run("workflowz", ["Custom One",],)).actionPayload?.workflowId,).toBe("custom-one",);
    expect((await run("omp", ["CUSTOM-ONE",],)).actionPayload?.workflowId,).toBe("custom-one",);
  });

  test("list enumerates workflows without starting a run", async () => {
    const out = await run("orchestrate", ["list",], "chat-list",);
    expect(out.action,).toBeUndefined();
    expect(out.systemMessage,).toContain("custom-one",);
    expect(out.systemMessage,).toContain("A custom workflow",);
    expect(getSession("chat-list",),).toBeUndefined();
  });

  test("an unknown workflow names it and lists the alternatives", async () => {
    const out = await run("omp", ["nope",],);
    expect(out.handled,).toBe(true,);
    expect(out.action,).toBeUndefined();
    expect(out.systemMessage,).toContain("nope",);
    expect(out.systemMessage,).toContain("Usage: `/omp",);
  });

  test("no configured workflows degrades to a readable notice", async () => {
    const handler = getCommand("omp",);
    if (!handler) { throw new Error("omp not registered",); }
    const emptyCtx = {
      chatId: "chat-empty",
      config: { templates: { workflows: { workflows: {}, }, }, } as unknown as CommandContext["config"],
    } as CommandContext;

    const out = await handler([], emptyCtx,);
    expect(out.handled,).toBe(true,);
    expect(out.action,).toBeUndefined();
    expect(out.systemMessage,).toContain("unavailable",);
    expect(getSession("chat-empty",),).toBeUndefined();
    expect(saved,).toHaveLength(0,);
  });

  test("a missing config block also degrades readably", async () => {
    const handler = getCommand("workflowz",);
    if (!handler) { throw new Error("workflowz not registered",); }
    const out = await handler([], { chatId: "chat-noconfig", } as CommandContext,);
    expect(out.handled,).toBe(true,);
    expect(out.systemMessage,).toContain("unavailable",);
    expect(getSession("chat-noconfig",),).toBeUndefined();
  });
});

describe("session lifecycle", () => {
  test("starting a run persists it through the session store (24h TTL applies)", async () => {
    await run("workflowz", [], "chat-ttl",);
    expect(saved,).toEqual([{ chatId: "chat-ttl", workflowId: "harness-workflowz", },],);
  });

  test("a second verb does not clobber an active run", async () => {
    await run("orchestrate", [], "chat-busy",);
    const second = await run("omp", [], "chat-busy",);
    expect(second.action,).toBeUndefined();
    expect(second.systemMessage,).toContain("already active",);
    expect(second.systemMessage,).toContain("Orchestrate",);
    expect(getSession("chat-busy",)?.workflow.id,).toBe("harness-orchestrate",);
    expect(saved,).toHaveLength(1,);
  });

  test("a different chat is unaffected by another chat's active run", async () => {
    await run("orchestrate", [], "chat-a",);
    const other = await run("omp", [], "chat-b",);
    expect(other.action,).toBe("workflow-start",);
    expect(other.actionPayload?.workflowId,).toBe("harness-small-agent",);
  });
});

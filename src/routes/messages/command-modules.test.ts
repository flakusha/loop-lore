// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct coverage for the slash-command dispatch modules: the stage runner,
 * the pipe chain, the chat-context fetch, the context builders and the
 * command registry's valve lookup.
 */

import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { parseCommand, } from "../../assistant/command-parser";
import {
  __unregisterCommandForTests,
  getCommandValves,
  registerCommand,
} from "../../assistant/commands/registry";
import type { CommandResult, } from "../../assistant/commands/registry";
import { expandMacros, LEGACY_TEMPLATE_MACRO_OPTIONS, } from "../../assistant/macro/engine";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { fetchDispatchContext, } from "./command-context";
import { dispatchPipeChain, } from "./command-pipe";
import { runCommandStage, } from "./command-run";
import { buildCommandContext, commandResponse, } from "./command-shared";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const config = {
  encryption: { compressThreshold: 1000, compressAlgorithm: "none", },
} as unknown as Config;

const PROBES = ["mod-echo", "mod-boom", "mod-{{char}}", ...Array.from({ length: 9, }, (_, i,) => `mod-cap-${i}`,),];

afterAll(() => {
  for (const name of PROBES) { __unregisterCommandForTests(name,); }
},);

interface Setup {
  db: Kysely<DB>;
  chatId: string;
  userId: string;
}

async function setup(): Promise<Setup> {
  const { db, } = await createTestDb();
  const userId = "user-modules-test";
  const chatId = "chat-modules-test";
  await insertUsers(db, userId, "Modules User", { id: userId, },);
  await insertActors(db, "Modules User", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  },);

  await insertChats(db, "Modules Chat", userId, { id: chatId, },);
  return { db, chatId, userId, };
}

/** Register a probe command emitting a fixed pipe text. */
function registerEcho(name: string, emit: string,): void {
  registerCommand(name, async (): Promise<CommandResult> => ({
    handled: true,
    systemMessage: `**${name}:** ${emit}`,
    pipe: { kind: "text", text: emit, },
  }), { capabilities: ["read-chat",], },);
}

describe("command dispatch modules", () => {
  it("exposes the valve schema of a registered command", () => {
    expect(getCommandValves("mod-echo",),).toBeUndefined();
  });

  it("expands nested values with the legacy template macro options", () => {
    const out = expandMacros("{{outer}}", {
      outer: "{{inner}}",
      inner: "deep",
    }, LEGACY_TEMPLATE_MACRO_OPTIONS,);

    expect(out,).toBe("deep",);
  });

  it("fetches the dispatch context for a chat", async () => {
    const { db, chatId, userId, } = await setup();
    const dispatch = await fetchDispatchContext(db, chatId, userId,);

    expect(dispatch.chat?.id,).toBe(chatId,);
    expect(dispatch.messages,).toEqual([],);
  });

  it("builds the command context from the dispatch context", async () => {
    const { db, chatId, userId, } = await setup();
    const dispatch = await fetchDispatchContext(db, chatId, userId,);
    const ctx = buildCommandContext({ chatId, database: db, config, dispatch, userId, },);

    expect(ctx.chatId,).toBe(chatId,);
    expect(ctx.roleInChat,).toBe(dispatch.role,);
  });

  it("renders a handled command response", async () => {
    const outcome = commandResponse("mod-echo", {
      handled: true,
      systemMessage: "done",
    },);

    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { throw new Error("outcome must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    expect(body.command,).toBe("mod-echo",);
    expect(body.systemMessage,).toBe("done",);
  });

  it("runs one command stage to completion", async () => {
    registerEcho("mod-echo", "stage emit",);
    const { db, chatId, userId, } = await setup();
    const dispatch = await fetchDispatchContext(db, chatId, userId,);
    const ctx = buildCommandContext({ chatId, database: db, config, dispatch, userId, },);
    const parsed = parseCommand("/mod-echo hello",);

    expect(parsed,).not.toBeNull();
    if (parsed === null) { throw new Error("parse must succeed",); }
    const outcome = await runCommandStage({ database: db, parsed, ctx, },);

    expect(outcome.status,).toBe("completed",);
  });

  it("chains stages and binds the first emit to {{pipe}}", async () => {
    registerEcho("mod-echo", "first emit",);
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchPipeChain(db, config, userId, chatId, "/mod-echo seed",);

    expect(outcome.handled,).toBe(true,);
  });

  it("rejects a chain longer than the stage cap", async () => {
    for (let i = 0; i < 9; i++) { registerEcho(`mod-cap-${i}`, `cap ${i}`,); }
    const { db, chatId, userId, } = await setup();
    const chain = PROBES.filter((name,) => name.startsWith("mod-cap-",)).map((name,) => `/${name} x`).join(" | ",);
    const outcome = await dispatchPipeChain(db, config, userId, chatId, chain,);

    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { throw new Error("outcome must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    expect(String(body.systemMessage,),).toContain("at most",);
  });

  it("aborts the chain when a stage throws", async () => {
    registerCommand("mod-boom", async (): Promise<CommandResult> => {
      throw new Error("boom",);
    }, { capabilities: ["read-chat",], },);

    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchPipeChain(db, config, userId, chatId, "/mod-boom x",);

    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { throw new Error("outcome must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    expect(String(body.systemMessage,),).toContain("Command failed",);
  });

  it("aborts a stage whose expansion no longer resolves to a command", async () => {
    // The registered name carries a macro, so the stage parses BEFORE the
    // expansion and breaks AFTER it.
    registerCommand("mod-{{char}}", async (): Promise<CommandResult> => ({
      handled: true,
      systemMessage: "never runs",
    }), { capabilities: ["read-chat",], },);

    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchPipeChain(db, config, userId, chatId, "/mod-{{char}}",);

    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { throw new Error("outcome must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    expect(String(body.systemMessage,),).toContain("no longer resolves to a command",);
  });
});

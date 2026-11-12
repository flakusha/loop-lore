// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { __unregisterCommandForTests, registerCommand, } from "../../assistant/commands/registry";
import type { CommandResult, } from "../../assistant/commands/registry";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { dispatchCommand, } from "./command";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const config = {
  encryption: { compressThreshold: 1000, compressAlgorithm: "none", },
} as unknown as Config;

interface Setup {
  db: Kysely<DB>;
  chatId: string;
  userId: string;
}

async function setup(): Promise<Setup> {
  const { db, } = await createTestDb();
  const userId = "user-pipe-test";
  const chatId = "chat-pipe-test";
  await insertUsers(db, userId, "Pipe User", { id: userId, },);
  await insertActors(db, "Pipe User", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  },);

  await insertChats(db, "Pipe Chat", userId, { id: chatId, },);
  return { db, chatId, userId, };
}

/** Register an echo-ish probe command emitting a fixed pipe text. */
function registerEcho(name: string, emit: string,): void {
  registerCommand(name, async (): Promise<CommandResult> => ({
    handled: true,
    systemMessage: `**${name}:** ${emit}`,
    pipe: { kind: "text", text: emit, },
  }), { capabilities: ["read-chat",], },);
}

describe("dispatchCommand pipe chains", () => {
  const PROBES = ["pipe-echo-a", "pipe-echo-b", "pipe-valved",];

  afterAll(() => {
    for (const name of PROBES) { __unregisterCommandForTests(name,); }
  },);

  it("chains two commands, binding the first emit to {{pipe}}", async () => {
    registerEcho("pipe-echo-a", "first emit",);
    registerCommand("pipe-echo-b", async (_args, ctx,): Promise<CommandResult> => ({
      handled: true,
      systemMessage: `**b got:** ${(ctx.positionalArgs ?? []).join(" ",)}`,
    }), { capabilities: ["read-chat",], },);

    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(
      db,
      config,
      userId,
      chatId,
      "/pipe-echo-a seed | /pipe-echo-b expand {{pipe}}",
    );

    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { throw new Error("chain must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    expect(body.command,).toBe("pipe-echo-a | pipe-echo-b",);
    const message = String(body.systemMessage,);
    expect(message,).toContain("**pipe-echo-a:** first emit",);
    // Stage 2's {{pipe}} received stage 1's emit, and the value itself was
    // expanded BEFORE stage 2 parsed (macro output, then args).
    expect(message,).toContain("expand first emit",);
  });

  it("aborts a chain mid-way without running later stages", async () => {
    registerEcho("pipe-echo-a", "first emit",);
    let laterRan = false;
    registerCommand("pipe-echo-b", async (): Promise<CommandResult> => {
      laterRan = true;
      return { handled: true, systemMessage: "b ran", };
    }, { capabilities: ["read-chat",], },);

    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(
      db,
      config,
      userId,
      chatId,
      "/pipe-echo-a seed | /definitely-not-registered | /pipe-echo-b",
    );

    // A non-command mid-chain stage is a structured error, and the stage
    // names were validated before any stage ran.
    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { throw new Error("validation error must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    expect(String(body.systemMessage,),).toContain("Pipe failed",);
    expect(String(body.systemMessage,),).toContain("stage 2",);
    expect(laterRan,).toBe(false,);
  });

  it("rejects unknown named args with the expected-arg list", async () => {
    const { t, } = await import("elysia");
    registerCommand("pipe-valved", async (): Promise<CommandResult> => ({
      handled: true,
      systemMessage: "should never run",
    }), {
      capabilities: ["read-chat",],
      valves: t.Object({ format: t.Optional(t.String({ default: "concise", },),), },),
    },);

    const { db, chatId, userId, } = await setup();
    let handlerRan = false;
    __unregisterCommandForTests("pipe-valved",);
    registerCommand("pipe-valved", async (): Promise<CommandResult> => {
      handlerRan = true;
      return { handled: true, systemMessage: "ran", };
    }, {
      capabilities: ["read-chat",],
      valves: t.Object({ format: t.Optional(t.String({ default: "concise", },),), },),
    },);

    const outcome = await dispatchCommand(db, config, userId, chatId, "/pipe-valved --colour red",);
    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { throw new Error("valve rejection must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    const message = String(body.systemMessage,);
    expect(message,).toContain("unknown argument --colour",);
    expect(message,).toContain("Expected: --format",);
    expect(handlerRan,).toBe(false,);
  });

  it("returns handled:false for plain text that merely contains a pipe", async () => {
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "just talking | about stuff",);
    expect(outcome.handled,).toBe(false,);
  });
});

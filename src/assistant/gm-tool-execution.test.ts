// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Tool Execution Tests
 *
 * Covers the wiring of `detectGmTool` into the message-send flow: GM-mode
 * gating, confidence threshold, fail-open on every aux failure mode, and
 * slash-command precedence. The detector is injected via the `detect` DI
 * seam — no process-global module mocks, safe under plain `bun test`.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { readFile, } from "node:fs/promises";
import type { Config, } from "../config/schema";
import { MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { dispatchCommand, } from "../routes/messages/command";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import type { GmToolDetection, } from "./gm-tool-detection";
import { executeGmToolRequest, isGmModeChat, } from "./gm-tool-execution";

// ─── Setup ────────────────────────────────────────────────────

beforeAll(() => {
  createLogger({ level: "error", },);
},);

// Minimal config: only shapes executeGmToolRequest touches (system-message
// insert reads encryption config only when isEncryptionEnabled() is true).
const config = {
  encryption: { compressThreshold: 1000, compressAlgorithm: "none", },
} as unknown as Config; // unchecked cast: test fixture, config schema is far larger

const detection = (
  name: GmToolDetection["name"],
  confidence: number,
  params: Record<string, unknown> = {},
): GmToolDetection => ({
  requested: name !== "none",
  name,
  params,
  confidence,
  source: "aux-llm",
});

interface SetupResult {
  db: Kysely<DB>;
  chatId: string;
  userId: string;
}

/** Create a user + chat, optionally GM-mode. */
async function setupChat(gm: boolean,): Promise<SetupResult> {
  const { db, } = await createTestDb();
  const userId = "user-gm-exec";
  const chatId = "chat-gm-exec";
  await insertUsers(db, userId, "GM Exec User", { id: userId, },);
  await insertActors(db, "GM Exec User", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  },);

  await insertChats(db, "GM Exec Chat", userId, {
    id: chatId,
    gm_config: gm ? JSON.stringify({ assistantRole: "gm", },) : null,
  },);

  return { db, chatId, userId, };
}

/** Count persisted system messages in the chat. */
async function systemMessageCount(db: Kysely<DB>, chatId: string,): Promise<number> {
  const row = await db
    .selectFrom("messages",)
    .select((eb,) => eb.fn.countAll<string>().as("count",))
    .where("chat_id", "=", chatId,)
    .where("role", "=", MessageRole.System as never,)
    .executeTakeFirstOrThrow();

  return Number(row.count,);
}

// ─── isGmModeChat ─────────────────────────────────────────────

describe("isGmModeChat", () => {
  it("detects gm assistant role", () => {
    expect(isGmModeChat(JSON.stringify({ assistantRole: "gm", },),),).toBe(true,);
  });

  it("rejects non-gm roles and invalid json", () => {
    expect(isGmModeChat(JSON.stringify({ assistantRole: "player", },),),).toBe(false,);
    expect(isGmModeChat(null,),).toBe(false,);
    expect(isGmModeChat("not json",),).toBe(false,);
  });
});

// ─── executeGmToolRequest ─────────────────────────────────────

describe("executeGmToolRequest", () => {
  it("is a no-op without detection when GM mode is off", async () => {
    const { db, chatId, userId, } = await setupChat(false,);
    let detectCalls = 0;
    const outcome = await executeGmToolRequest({
      database: db,
      config,
      actorId: userId,
      chatId,
      content: "roll a d20",
      detect: async () => {
        detectCalls += 1;
        return detection("roll_dice", 0.9,);
      },
    },);

    expect(outcome.handled,).toBe(false,);
    expect(detectCalls,).toBe(0,);
    expect(await systemMessageCount(db, chatId,),).toBe(0,);
  });

  it("executes the mapped command and posts a system message", async () => {
    const { db, chatId, userId, } = await setupChat(true,);
    const outcome = await executeGmToolRequest({
      database: db,
      config,
      actorId: userId,
      chatId,
      content: "roll a d20",
      detect: async () => detection("roll_dice", 0.9, { dice: "d20", },),
    },);

    expect(outcome.handled,).toBe(true,);
    if (!outcome.handled) { return; }
    const body = await outcome.response.json() as { command?: string; systemMessage?: string };
    expect(body.command,).toBe("roll",);
    expect(body.systemMessage,).toBeTruthy();
    expect(await systemMessageCount(db, chatId,),).toBe(1,);
  });

  it("does not execute below the confidence threshold", async () => {
    const { db, chatId, userId, } = await setupChat(true,);
    const outcome = await executeGmToolRequest({
      database: db,
      config,
      actorId: userId,
      chatId,
      content: "maybe roll something",
      detect: async () => detection("roll_dice", 0.5,),
    },);

    expect(outcome.handled,).toBe(false,);
    expect(await systemMessageCount(db, chatId,),).toBe(0,);
  });

  it("does not execute when detection is null or 'none'", async () => {
    const { db, chatId, userId, } = await setupChat(true,);
    for (const result of [null, detection("none", 0.95,),]) {
      const outcome = await executeGmToolRequest({
        database: db,
        config,
        actorId: userId,
        chatId,
        content: "hello there",
        detect: async () => result,
      },);

      expect(outcome.handled,).toBe(false,);
    }

    expect(await systemMessageCount(db, chatId,),).toBe(0,);
  });

  it("does not execute or throw when detection throws", async () => {
    const { db, chatId, userId, } = await setupChat(true,);
    const outcome = await executeGmToolRequest({
      database: db,
      config,
      actorId: userId,
      chatId,
      content: "roll a d20",
      detect: async () => {
        throw new Error("aux unavailable",);
      },
    },);

    expect(outcome.handled,).toBe(false,);
    expect(await systemMessageCount(db, chatId,),).toBe(0,);
  });

  it("is a no-op when the detected tool has no registered command", async () => {
    const { db, chatId, userId, } = await setupChat(true,);
    const outcome = await executeGmToolRequest({
      database: db,
      config,
      actorId: userId,
      chatId,
      content: "modify the world",
      detect: async () => detection("modify_world", 0.95,),
    },);

    expect(outcome.handled,).toBe(false,);
    expect(await systemMessageCount(db, chatId,),).toBe(0,);
  });

  it("never fires for slash input: dispatchCommand wins first", async () => {
    const { db, chatId, userId, } = await setupChat(true,);
    // Behavioral half: the slash path claims dice input outright.
    const slash = await dispatchCommand(db, config, userId, chatId, "/roll d20",);
    expect(slash.handled,).toBe(true,);
    // Structural half: in the message-send route, GM execution is wired
    // strictly after the slash dispatch early-return, so a handled slash
    // command can never double-execute via the GM path.
    const routeSource = await readFile(
      new URL("../routes/messages/create.ts", import.meta.url,),
      "utf8",
    );

    const slashIdx = routeSource.indexOf("dispatchCommand(database",);
    const gmIdx = routeSource.indexOf("executeGmToolRequest({",);
    expect(slashIdx,).toBeGreaterThan(-1,);
    expect(gmIdx,).toBeGreaterThan(slashIdx,);
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Routes/messages command dispatch tests.
 *
 * Covers dispatchCommand end-to-end against a migrated test DB (handler
 * execution, system-message persistence, unhandled passthrough) plus the
 * shared chat-context helpers used by both the slash and GM tool paths.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { parseCommand, } from "../../assistant/command-parser";
import { registerCommand, } from "../../assistant/commands/registry";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, type Logger, setGlobalLogger, } from "../../logger";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { commandActiveChat, dispatchCommand, fetchChatAndRole, } from "./command";

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
  const userId = "user-cmd-test";
  const chatId = "chat-cmd-test";
  await insertUsers(db, userId, "Cmd User", { id: userId, },);
  await insertActors(db, "Cmd User", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  },);

  await insertChats(db, "Cmd Chat", userId, { id: chatId, },);
  return { db, chatId, userId, };
}

describe("fetchChatAndRole", () => {
  it("returns the chat row and defaults the role to member", async () => {
    const { db, chatId, userId, } = await setup();
    const { chat, role, currentCharacter, } = await fetchChatAndRole(db, chatId, userId,);
    expect(chat?.id,).toBe(chatId,);
    expect(chat?.gm_config,).toBeNull();
    expect(role,).toBe("member",);
    // No participant row → no impersonation → no currentCharacter.
    expect(currentCharacter,).toBeUndefined();
  });

  it("returns the impersonated actor as currentCharacter", async () => {
    const { db, chatId, userId, } = await setup();
    const charId = await insertActors(db, "Iria", { actor_type: "character", owner_id: userId, },);
    await insertChatParticipants(db, chatId, userId, { impersonate_actor_id: charId, },);

    const { currentCharacter, } = await fetchChatAndRole(db, chatId, userId,);
    expect(currentCharacter,).toEqual({ id: charId, name: "Iria", },);
  });

  it("returns undefined chat for an unknown chat id", async () => {
    const { db, userId, } = await setup();
    const { chat, role, } = await fetchChatAndRole(db, "chat-missing", userId,);
    expect(chat,).toBeUndefined();
    expect(role,).toBe("member",);
  });
});

describe("commandActiveChat", () => {
  it("maps a chat row with null mode/type/world to undefined fields", () => {
    const active = commandActiveChat({
      id: "c1",
      mode: null,
      type: null,
      gm_config: null,
      world_id: null,
    },);

    expect(active,).toEqual({ id: "c1", mode: undefined, type: undefined, worldId: undefined, },);
  });

  it("returns undefined for a missing chat row", () => {
    expect(commandActiveChat(undefined,),).toBeUndefined();
  });
});

describe("dispatchCommand", () => {
  it("handles a slash command and persists its system message", async () => {
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "/narrate The sky darkens.",);
    expect(outcome.handled,).toBe(true,);
    const row = await db
      .selectFrom("messages",)
      .select(["role", "content",],)
      .where("chat_id", "=", chatId,)
      .where("role", "=", MessageRole.System as never,)
      .orderBy("created_at", "desc",)
      .executeTakeFirst();

    expect(row?.content,).toContain("The sky darkens.",);
  });

  it("returns handled:false for content that is not a command", async () => {
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "just talking",);
    expect(outcome.handled,).toBe(false,);
  });

  it("returns handled:false for an unregistered command name", async () => {
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "/definitely-not-a-command",);
    expect(outcome.handled,).toBe(false,);
  });

  it("denies a command the capability guard rejects, without running the handler", async () => {
    let handlerRan = false;
    // No capability declaration: the guard fails closed on an undeclared
    // command, so the handler must never run.
    registerCommand("guard-denied-probe", async () => {
      handlerRan = true;
      return { handled: true, systemMessage: "probe-ran", };
    },);

    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "/guard-denied-probe",);

    expect(outcome.handled,).toBe(true,);
    expect(handlerRan,).toBe(false,);
    if (!outcome.handled) { throw new Error("the denial must be handled",); }
    const body = await outcome.response.json() as Record<string, unknown>;
    expect(body.command,).toBe("guard-denied-probe",);
    expect(String(body.systemMessage,),).toContain("Permission denied",);
    expect(body.action,).toBeNull();
    expect(body.actionPayload,).toBeNull();
  });
});

describe("invocation audit", () => {
  interface AuditEntry {
    level: string;
    message: string;
    meta?: Record<string, unknown>;
  }

  const entries: AuditEntry[] = [];
  let priorLogger: Logger | undefined;

  /** Capture-only logger implementing the full Logger interface (the spread
   * of a class instance drops prototype methods like trace, which
   * parseCommand's internal logging calls). */
  class AuditCaptureLogger implements Logger {
    trace(message: string, meta?: Record<string, unknown>,): void {
      entries.push({ level: "trace", message, meta, },);
    }
    debug(message: string, meta?: Record<string, unknown>,): void {
      entries.push({ level: "debug", message, meta, },);
    }
    info(message: string, meta?: Record<string, unknown>,): void {
      entries.push({ level: "info", message, meta, },);
    }
    warn(message: string, meta?: Record<string, unknown>,): void {
      entries.push({ level: "warn", message, meta, },);
    }
    error(message: string, error?: Error, meta?: Record<string, unknown>,): void {
      entries.push({ level: "error", message, meta: { ...meta, error: error?.message, }, },);
    }
    fatal(message: string, error?: Error, meta?: Record<string, unknown>,): void {
      entries.push({ level: "fatal", message, meta: { ...meta, error: error?.message, }, },);
    }
    child(): Logger {
      return this;
    }
    addTransport(): void {}
    setBindings(): void {}
    setLevel(): void {}
    flush(): Promise<void> {
      return Promise.resolve();
    }
  }

  afterAll(() => {
    if (priorLogger) { setGlobalLogger(priorLogger,); }
  },);

  /** Swap in the capture logger (entries reset per test). */
  function captureAudit(): void {
    entries.length = 0;
    priorLogger = getLogger();
    setGlobalLogger(new AuditCaptureLogger(),);
  }

  function auditEvents(): Array<Record<string, unknown>> {
    return entries
      .filter((e,) => e.meta?.event === "assistant_command_invoked")
      .map((e,) => e.meta!);
  }

  it("emits one structured event with command, user, args, and a stable hash", async () => {
    const { db, chatId, userId, } = await setup();
    captureAudit();
    try {
      await dispatchCommand(db, config, userId, chatId, "/narrate The sky darkens.",);
      const events = auditEvents();
      expect(events,).toHaveLength(1,);

      const [event,] = events;
      expect(event?.command,).toBe("narrate",);
      expect(event?.userId,).toBe(userId,);
      expect(event?.args,).toEqual(parseCommand("/narrate The sky darkens.",)!.args,);
      expect(event?.outputHash,).toMatch(/^[0-9a-f]{64}$/,);

      // Determinism: identical dispatch → identical hash (replay detection).
      const { db: db2, chatId: chatId2, userId: userId2, } = await setup();
      await dispatchCommand(db2, config, userId2, chatId2, "/narrate The sky darkens.",);
      expect(auditEvents(),).toHaveLength(2,);
      expect(auditEvents()[1]!.outputHash,).toBe(event?.outputHash,);
    } finally {
      if (priorLogger) { setGlobalLogger(priorLogger,); }
    }
  });

  it("still audits when the handler throws — the failure result is hashed", async () => {
    registerCommand("audit-throw-probe", async () => {
      throw new Error("probe failure",);
    }, { capabilities: ["read-chat",], },);

    const { db, chatId, userId, } = await setup();
    captureAudit();
    try {
      const outcome = await dispatchCommand(db, config, userId, chatId, "/audit-throw-probe",);
      expect(outcome.handled,).toBe(true,);
      const events = auditEvents();
      expect(events,).toHaveLength(1,);
      expect(events[0]!.command,).toBe("audit-throw-probe",);
      expect(events[0]!.outputHash,).toMatch(/^[0-9a-f]{64}$/,);
    } finally {
      if (priorLogger) { setGlobalLogger(priorLogger,); }
    }
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Workflow dispatch integration tests.
//
// Drives trigger → preview → step fills → confirm through the real
// slash-command dispatch (src/routes/messages/command.ts) over a test DB:
// no LLM, no provider — the test workflow uses a stub backend so confirm
// returns the dispatch envelope.

import { beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AssistantWorkflowConfig, } from "../../config/sections/templates";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { dispatchCommand, } from "../../routes/messages/command";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { clearSessions, } from "../workflow-session";
import { deletePersistedSession, } from "../workflow-session-store";
import "./index"; // register all slash commands (self-registering)

const CALLER_ID = "workflow-user";

const VIDEO_WORKFLOW: AssistantWorkflowConfig = {
  id: "test-video",
  name: "Test video",
  triggers: ["make a video",],
  steps: [
    {
      id: "subject",
      name: "Subject",
      type: "text",
      description: "Main subject.",
      minLength: 4,
      formatTemplate: "Subject: {value}",
    },
    {
      id: "motion",
      name: "Motion",
      type: "choice",
      options: ["static", "pan",],
      formatTemplate: "Motion: {value}",
    },
  ],
  dispatch: {
    backend: "test-backend",
    target: "POST /test",
    payloadTemplate: { prompt: "{prompt}", },
  },
  approval: { type: "confirm", preview: true, },
};
const ENTITY_WORKFLOW: AssistantWorkflowConfig = {
  id: "test-character",
  name: "Test character",
  triggers: ["new hero",],
  steps: [
    {
      id: "concept",
      name: "Concept",
      type: "text",
      description: "Core concept.",
      formatTemplate: "Concept: {value}",
    },
  ],
  dispatch: { backend: "assistant-create", target: "/create", payloadTemplate: {}, },
  approval: { type: "confirm", preview: true, },
};

const CONFIG = {
  templates: {
    workflows: {
      merge: "extend",
      workflows: { "test-video": VIDEO_WORKFLOW, "test-character": ENTITY_WORKFLOW, },
    },
  },
} as never;

/**
 * @param db
 * @param chatId
 * @param content
 */
async function send(db: Kysely<DB>, chatId: string, content: string,): Promise<{
  handled: boolean;
  body?: Record<string, unknown>;
}> {
  const result = await dispatchCommand(db, CONFIG, CALLER_ID, chatId, content,);
  if (!result.handled) { return { handled: false, }; }
  return { handled: true, body: await result.response.json() as Record<string, unknown>, };
}

describe("workflow dispatch via message route", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    chatId = uid();
    await insertUsers(db, `user-${CALLER_ID}`, "Workflow User", { id: CALLER_ID, } as never,);
    await insertActors(db, "Workflow User", {
      id: CALLER_ID,
      actor_type: "user",
      agent_type: "none",
      user_id: CALLER_ID,
      owner_id: CALLER_ID,
    } as never,);
    await insertChats(db, "Workflow Chat", CALLER_ID, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, CALLER_ID, { role_in_chat: "member", } as never,);
  },);

  beforeEach(async () => {
    clearSessions();
    await deletePersistedSession(db, chatId,);
  },);

  test("unrelated messages fall through to the normal path", async () => {
    expect(await send(db, chatId, "hello everyone",),).toEqual({ handled: false, },);
  });

  test("trigger starts a run with preview, steps fill in order", async () => {
    const started = await send(db, chatId, "please make a video of the harbor",);
    expect(started.handled,).toBe(true,);
    expect(started.body?.action,).toBe("workflow-preview",);
    expect(String(started.body?.systemMessage ?? "",),).toContain("Test video",);

    const rejected = await send(db, chatId, "abc",);
    expect(String(rejected.body?.systemMessage ?? "",),).toContain("Step rejected",);

    const first = await send(db, chatId, "neon alley at night",);
    expect(String(first.body?.systemMessage ?? "",),).toContain("2/2",);
    expect(first.body?.action,).toBe("workflow-progress",);

    const second = await send(db, chatId, "static",);
    expect(String(second.body?.systemMessage ?? "",),).toContain("/workflow confirm",);
  });

  test("confirm dispatches the envelope with the assembled prompt", async () => {
    await send(db, chatId, "make a video",);
    await send(db, chatId, "neon alley at night",);
    await send(db, chatId, "static",);
    const confirmed = await send(db, chatId, "/workflow confirm",);
    expect(confirmed.body?.action,).toBe("workflow-dispatch",);
    const payload = confirmed.body?.actionPayload as Record<string, unknown>;
    expect(payload.target,).toBe("POST /test",);
    expect(payload.prompt,).toBe("Subject: neon alley at night\nMotion: static",);
    // Session closed — next message falls through again.
    expect(await send(db, chatId, "hello again",),).toEqual({ handled: false, },);
  });

  test("confirm refuses incomplete runs and cancel aborts", async () => {
    await send(db, chatId, "make a video",);
    const early = await send(db, chatId, "/workflow confirm",);
    expect(String(early.body?.systemMessage ?? "",),).toContain("still missing",);

    const cancelled = await send(db, chatId, "/workflow cancel",);
    expect(String(cancelled.body?.systemMessage ?? "",),).toContain("cancelled",);
    expect(await send(db, chatId, "hello again",),).toEqual({ handled: false, },);
  });

  test("registered slash commands win over step capture", async () => {
    await send(db, chatId, "make a video",);
    const help = await send(db, chatId, "/help",);
    expect(help.handled,).toBe(true,);
    expect(help.body?.command,).toBe("help",);
    // Run still active — plain text still fills steps.
    const progress = await send(db, chatId, "neon alley at night",);
    expect(progress.body?.action,).toBe("workflow-progress",);
  });
  test("status with no active run reports empty", async () => {
    const status = await send(db, chatId, "/workflow status",);
    expect(String(status.body?.systemMessage ?? "",),).toContain("No active workflow",);
  });

  test("entity confirm degrades gracefully without a provider", async () => {
    await send(db, chatId, "we need a new hero for the party",);
    await send(db, chatId, "a retired skyship navigator",);
    const confirmed = await send(db, chatId, "/workflow confirm",);
    expect(confirmed.handled,).toBe(true,);
    expect(String(confirmed.body?.systemMessage ?? "",),).toContain("Entity creation unavailable",);
  });

  test("leading @mention is stripped before trigger match and step fill", async () => {
    const started = await send(db, chatId, "@helper please make a video",);
    expect(started.handled,).toBe(true,);
    expect(started.body?.action,).toBe("workflow-preview",);

    await send(db, chatId, "@helper neon alley at night",);
    await send(db, chatId, "@helper static",);
    const confirmed = await send(db, chatId, "/workflow confirm",);
    const payload = confirmed.body?.actionPayload as Record<string, unknown>;
    // Stored step values carry no addressing prefix.
    expect(payload.prompt,).toBe("Subject: neon alley at night\nMotion: static",);
  });

  test("addressed slash commands dispatch", async () => {
    const help = await send(db, chatId, "@helper /help",);
    expect(help.handled,).toBe(true,);
    expect(help.body?.command,).toBe("help",);
  });

  test("lone mention falls through", async () => {
    expect(await send(db, chatId, "@helper",),).toEqual({ handled: false, },);
  });

  test("run resumes from persistence after memory loss (restart)", async () => {
    await send(db, chatId, "make a video",);
    await send(db, chatId, "neon alley at night",);
    // Simulate a restart: memory gone, DB row remains.
    clearSessions();
    const resumed = await send(db, chatId, "static",);
    expect(resumed.body?.action,).toBe("workflow-progress",);
    expect(String(resumed.body?.systemMessage ?? "",),).toContain("/workflow confirm",);
    // Cancel clears both memory and the persisted row.
    await send(db, chatId, "/workflow cancel",);
    clearSessions();
    expect(await send(db, chatId, "static",),).toEqual({ handled: false, },);
  });
});

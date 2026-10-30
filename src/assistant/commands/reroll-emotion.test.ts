// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /reroll-emotion command tests — dispatch to the emotion-avatar SERVICE
 * (not the HTTP route), actor resolution per command context, and the
 * missing actor/slot error paths.
 *
 * Uses in-memory SQLite via createTestDb(). The suite stubs
 * `startBatchGeneration` on the prototype: dispatch delegates to it and the
 * export shape is what matters here; the service's own tests cover the run.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { EmotionAvatarService, } from "../../characters/services/emotion-avatar-service";
import type { BatchJobId, } from "../../characters/services/emotion-avatar-service/types";
import { EmotionType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssets,
  insertCharacterAvatars,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { getCommand, } from "./registry";
import type { CommandContext, } from "./registry";
import { runRerollEmotion, } from "./reroll-emotion";
import "./index";

const OWNER = "user-reroll";
let fixture: TestDb;
let db: Kysely<DB>;
let chatId: string;
let heroId: string;
let villainId: string;
let baseAvatarId: string;

/** Calls the service records (actorId/base/emotions/replace) — dispatch proof. */
let calls: {
  actorId: string;
  baseAvatarId: string;
  emotions: EmotionType[] | undefined;
  replace: boolean | undefined;
}[];

const realStart = EmotionAvatarService.prototype.startBatchGeneration;

beforeAll(async () => {
  createLogger({ level: "error", },);
  fixture = await createTestDb();
  db = fixture.db;
  calls = [];
  EmotionAvatarService.prototype.startBatchGeneration = (async function(
    this: EmotionAvatarService,
    opts: { actorId: string; baseAvatarId: string; emotions?: EmotionType[]; replace?: boolean },
  ) {
    calls.push({
      actorId: opts.actorId,
      baseAvatarId: opts.baseAvatarId,
      emotions: opts.emotions,
      replace: opts.replace,
    },);

    return "job-reroll-1" as BatchJobId;
  }) as typeof realStart;

  await insertUsers(db, "reroller", "Reroller", { id: OWNER, },);
  heroId = await insertActors(db, "Luna", {
    id: `actor-${uid()}`,
    actor_type: "character",
    user_id: null,
    owner_id: OWNER,
    agent_type: "ai",
  },);

  villainId = await insertActors(db, "Drak", {
    id: `actor-${uid()}`,
    actor_type: "character",
    user_id: null,
    owner_id: OWNER,
    agent_type: "ai",
  },);

  chatId = await insertChats(db, "Reroll Chat", OWNER, { id: `chat-${uid()}`, type: "group", mode: "group", },);
  const ownerActorId = await insertActors(db, "Reroller", {
    id: `actor-${uid()}`,
    actor_type: "user",
    user_id: OWNER,
    owner_id: OWNER,
    agent_type: "none",
  },);

  await insertChatParticipants(db, chatId, ownerActorId, { role_in_chat: "owner", },);
  await insertChatParticipants(db, chatId, heroId, { role_in_chat: "member", },);
  await insertChatParticipants(db, chatId, villainId, { role_in_chat: "member", },);
  const assetId = await insertAssets(db, OWNER, "luna.png", "image/png", "image", 10, "/tmp/luna.png", {
    id: `asset-${uid()}`,
  },);

  const now = new Date().toISOString();
  baseAvatarId = await insertCharacterAvatars(db, heroId, assetId, "base", now, now, {
    id: `avatar-${uid()}`,
    tags: "{}",
    is_primary: 1,
  },);
},);

afterAll(async () => {
  EmotionAvatarService.prototype.startBatchGeneration = realStart;
  await destroyTestDb(fixture,);
},);

beforeEach(() => {
  calls = [];
},);

/** Command context for the reroll chat. */
function ctxFor(overrides?: Partial<CommandContext>,): CommandContext {
  return { chatId, db, userId: OWNER, ...overrides, };
}

describe("reroll-emotion command", () => {
  test("registered under the registry", () => {
    expect(getCommand("reroll-emotion",),).toBeDefined();
  });

  test("full batch delegates to the service with replace and the primary avatar", async () => {
    const result = await runRerollEmotion(["@Luna",], ctxFor(),);
    expect(result.handled,).toBe(true,);
    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.actorId,).toBe(heroId,);
    expect(calls[0]?.baseAvatarId,).toBe(baseAvatarId,);
    expect(calls[0]?.emotions,).toBeUndefined();
    expect(calls[0]?.replace,).toBe(true,);
    expect(result.action,).toBe("regenerate-emotion-avatars",);
    expect(result.actionPayload,).toMatchObject({ actorId: heroId, baseAvatarId, jobId: "job-reroll-1", },);
  });

  test("mentioned actor in a group chat resolves by display name", async () => {
    const result = await runRerollEmotion(["@Drak", "happy",], ctxFor(),);
    expect(result.handled,).toBe(true,);
    // Drak has no primary avatar, so resolution succeeded (actor error
    // names Drak) instead of falling back to the chat default.
    expect(result.systemMessage,).toContain("Drak",);
    expect(result.systemMessage,).toContain("no primary avatar",);
    expect(calls,).toHaveLength(0,);
  });

  test("subset slots pass through to the service", async () => {
    const result = await runRerollEmotion(["@Luna", "happy", "sad",], ctxFor(),);
    expect(result.handled,).toBe(true,);
    expect(calls[0]?.emotions,).toEqual(["happy", "sad",],);
  });

  test("missing base avatar errors without dispatching", async () => {
    const result = await runRerollEmotion(["@Drak",], ctxFor(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Drak",);
    expect(result.systemMessage,).toContain("no primary avatar",);
    expect(calls,).toHaveLength(0,);
  });

  test("unknown slot errors without dispatching", async () => {
    const result = await runRerollEmotion(["happy", "ecstatic",], ctxFor(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain('unknown emotion slot "ecstatic"',);
    expect(calls,).toHaveLength(0,);
  });

  test("unknown actor token errors without dispatching", async () => {
    const result = await runRerollEmotion(["@Nobody",], ctxFor(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain('"@Nobody" is not a participant',);
    expect(calls,).toHaveLength(0,);
  });

  test("missing database degrades to an unavailable notice", async () => {
    const result = await runRerollEmotion([], ctxFor({ db: undefined, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("missing database",);
  });
});

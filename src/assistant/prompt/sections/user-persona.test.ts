/**
 * userPersonaSection tests — impersonation & persona prompt injection.
 *
 * The section injects the human user's active identity into the prompt when
 * the chat_participants row for that user carries an impersonation target or
 * a selected persona (see docs/spec/impersonation.md § Prompt priority):
 *   - impersonate_actor_id → the actor's display_name + description + personality;
 *   - else persona_id      → the persona's name + description;
 *   - else                 → no <user_persona> section.
 *
 * The DB-backed path is exercised (createTestDb) because the section resolves
 * the participant row, the impersonated actor, and the persona via Kysely.
 * The user row is backed by an actors row (id = userId) exactly like
 * src/routes/auth/register.ts creates on signup — chat_participants.actor_id
 * references actors.id, so the user must exist as an actor to participate.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertPersonas,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import type { AssembleContext, } from "../types";
import { userPersonaSection, } from "./user-persona";

const SECTION_OPEN = "<user_persona>";
const SECTION_CLOSE = "</user_persona>";

describe("userPersonaSection", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    await insertUsers(db, "tester", "Tester", { id: userId, } as never,);
    // Registration creates a user actor with id = userId (see register.ts).
    await insertActors(db, "Tester", { id: userId as never, user_id: userId, owner_id: userId, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  /** Create a fresh chat (chat_participants PK is chat_id + actor_id). */
  async function freshChat(): Promise<string> {
    const chatId = uid();
    await insertChats(db, "Test chat", userId, { id: chatId, } as never,);
    return chatId;
  }

  /**
   * Context carrying a real chat + the acting user.
   * @param chatId
   * @param withUserId
   */
  function ctxFor(chatId: string, withUserId = true,): AssembleContext {
    return {
      db,
      actor: {
        id: "actor-stub",
        display_name: "Alice",
        system_prompt: null,
        description: null,
        personality: null,
        scenario: null,
        post_history_instructions: null,
        mes_example: null,
        agent_role: null,
      },
      chat: { id: chatId, mode: "story", world_id: null, current_location_id: null, },
      params: { actorId: "actor-stub", chatId, modelId: "test-model", ...(withUserId && { userId, }), },
      isStory: true,
      tokenBudget: 4000,
    };
  }

  /**
   * @param displayName
   */
  async function createImpersonatedActor(displayName: string,): Promise<string> {
    const id = uid();
    await insertActors(db, displayName, {
      id: id as never,
      description: `${displayName} description`,
      personality: `${displayName} personality`,
    },);
    return id;
  }

  test("enabled only when the caller passes a userId", async () => {
    const chatId = await freshChat();
    expect(userPersonaSection.enabled(ctxFor(chatId, false,),),).toBe(false,);
    expect(userPersonaSection.enabled(ctxFor(chatId,),),).toBe(true,);
  });

  test("no participant row → no section", async () => {
    const chatId = await freshChat();
    const built = await userPersonaSection.build(ctxFor(chatId,),);
    expect(built,).toEqual([],);
  });

  test("impersonating an actor injects name, description, personality", async () => {
    const chatId = await freshChat();
    const heroId = await createImpersonatedActor("Kaelen the Bold",);
    await insertChatParticipants(db, chatId, userId, { impersonate_actor_id: heroId, },);
    const built = await userPersonaSection.build(ctxFor(chatId,),);
    expect(built,).toHaveLength(1,);
    const content = String(built[0]?.content,);
    expect(content,).toContain(SECTION_OPEN,);
    expect(content,).toContain(SECTION_CLOSE,);
    expect(content,).toContain("Name: Kaelen the Bold",);
    expect(content,).toContain("Description: Kaelen the Bold description",);
    expect(content,).toContain("Personality: Kaelen the Bold personality",);
  });

  test("selected persona injects name and description", async () => {
    const chatId = await freshChat();
    await insertPersonas(db, userId, "Scholar Rowan", { description: "A quiet scholar of old lore.", },);
    const persona = await db
      .selectFrom("personas",)
      .select(["id",],)
      .where("user_id", "=", userId,)
      .executeTakeFirstOrThrow();
    await insertChatParticipants(db, chatId, userId, { persona_id: persona.id, },);
    const built = await userPersonaSection.build(ctxFor(chatId,),);
    expect(built,).toHaveLength(1,);
    const content = String(built[0]?.content,);
    expect(content,).toContain("Name: Scholar Rowan",);
    expect(content,).toContain("Description: A quiet scholar of old lore.",);
  });

  test("impersonation wins over persona (spec priority)", async () => {
    const chatId = await freshChat();
    const heroId = await createImpersonatedActor("Dual Identity Hero",);
    await insertPersonas(db, userId, "Plain Persona",);
    const persona = await db
      .selectFrom("personas",)
      .select(["id",],)
      .where("user_id", "=", userId,)
      .executeTakeFirstOrThrow();
    await insertChatParticipants(db, chatId, userId, {
      impersonate_actor_id: heroId,
      persona_id: persona.id,
    },);
    const built = await userPersonaSection.build(ctxFor(chatId,),);
    expect(built,).toHaveLength(1,);
    const content = String(built[0]?.content,);
    expect(content,).toContain("Name: Dual Identity Hero",);
    expect(content,).not.toContain("Plain Persona",);
  });

  test("participant row with no identity → no section", async () => {
    const chatId = await freshChat();
    await insertChatParticipants(db, chatId, userId,);
    const built = await userPersonaSection.build(ctxFor(chatId,),);
    expect(built,).toEqual([],);
  });

  test("impersonation target with no identity fields → no section", async () => {
    const chatId = await freshChat();
    const blankId = uid();
    await insertActors(db, "", { id: blankId as never, },);
    await insertChatParticipants(db, chatId, userId, { impersonate_actor_id: blankId, },);
    const built = await userPersonaSection.build(ctxFor(chatId,),);
    expect(built,).toEqual([],);
  });
});

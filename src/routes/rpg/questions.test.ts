/**
 * RPG Questions Routes tests.
 *
 * Mounts the questions routes behind a stub auth middleware and exercises
 * create/list/answer over a real test DB: auth (401), chat + emitter actor
 * ownership (404), validation (422), and the answer happy path plus its
 * typed error mappings (409 already-answered, 400 invalid option).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { questionsRoutes, } from "./questions";

describe("questionsRoutes", () => {
  test("exports function", () => {
    expect(typeof questionsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = questionsRoutes({ database: {} as never, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });
});

describe("questions create/list/answer (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let otherUserId: string;
  let actorlessUserId: string;
  let chatId: string;
  let emitterActorId: string;
  let questionId: string;

  const options = [
    { id: "a", text: "Attack", },
    { id: "b", text: "Retreat", },
  ];

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    otherUserId = uid();
    actorlessUserId = uid();
    for (
      const [id, name,] of [[userId, "Chat Owner",], [otherUserId, "Outsider",], [
        actorlessUserId,
        "No Persona",
      ],] as const
    ) {
      await insertUsers(
        db,
        `user-${id}`,
        name,
        { id, role: "solo", status: "active", settings: "{}", } as never,
      );
    }

    // Primary persona (answers) + emitter character (creates questions).
    await insertActors(db, "Player Persona", { user_id: userId, } as never,);
    emitterActorId = uid();
    await insertActors(db, "GM Character", { id: emitterActorId, owner_id: userId, } as never,);

    chatId = uid();
    await insertChats(db, "Questions Route Chat", userId, { id: chatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param actingUserId
   */
  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-questions-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(questionsRoutes({ database: db, config: {} as never, },),) as any;
  }

  /** Unauthenticated app — no userId in context. */
  function anonApp(): Elysia {
    return new Elysia({ name: "test-questions-anon", },)
      .use(questionsRoutes({ database: db, config: {} as never, },),) as any;
  }

  test("rejects unauthenticated requests with 401", async () => {
    const app = anonApp();
    const createRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "dialogue", prompt: "Hi", options, actorId: emitterActorId, },),
      },),
    );
    expect(createRes.status,).toBe(401,);

    const listRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`,),
    );
    expect(listRes.status,).toBe(401,);
  });

  test("rejects non-owner chat access with 404", async () => {
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("rejects invalid create body with 422", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "nonsense", prompt: "Hi", options: [], actorId: emitterActorId, },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("rejects create from an actor the caller does not own with 404", async () => {
    const strangerActorId = uid();
    await insertActors(db, "Stranger Actor", { id: strangerActorId, owner_id: otherUserId, } as never,);
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "combat", prompt: "Roll initiative", options, actorId: strangerActorId, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("create question returns 201 with parsed options", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "combat", prompt: "Roll initiative", options, actorId: emitterActorId, },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string; status: string; options: unknown; prompt: string };
    expect(body.id,).toBeString();
    expect(body.status,).toBe("open",);
    expect(body.options,).toEqual(options,);
    expect(body.prompt,).toBe("Roll initiative",);
    questionId = body.id;
  });

  test("list open questions includes the created question", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { questions: { id: string }[] };
    expect(Array.isArray(body.questions,),).toBe(true,);
    expect(body.questions.some((q,) => q.id === questionId),).toBe(true,);
  });

  test("answer without a primary persona returns 404", async () => {
    const app = authedApp(actorlessUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "a", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("answer records choice, appends system message, and empties open list", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "b", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { status: string; selectedOptionId: string };
    expect(body.status,).toBe("answered",);
    expect(body.selectedOptionId,).toBe("b",);

    // System message appended by the answer orchestration.
    const message = await db.selectFrom("messages",).selectAll()
      .where("chat_id", "=", chatId,)
      .where("role", "=", "system",)
      .executeTakeFirst();
    expect(message,).toBeDefined();
    expect(message!.content,).toBe("Answer recorded: Retreat",);

    // No longer open.
    const listRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`,),
    );
    const listBody = (await listRes.json()) as { questions: { id: string }[] };
    expect(listBody.questions.some((q,) => q.id === questionId),).toBe(false,);
  });

  test("re-answering an answered question returns 409", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "a", },),
      },),
    );
    expect(res.status,).toBe(409,);
  });

  test("answering with an unknown option returns 400", async () => {
    const app = authedApp();
    const createRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          type: "exploration",
          prompt: "Open the chest?",
          options,
          actorId: emitterActorId,
        },),
      },),
    );
    const created = (await createRes.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/questions/${created.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "does-not-exist", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });
});

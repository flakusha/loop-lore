// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the message-translation variant surface: auth gates,
 * 404 (never 403-leak) on foreign ids, unknown-locale 400, on-demand
 * translate + idempotent retranslate, and list/get decryption passthrough.
 *
 * Authorization contract (server-side, verified per entry point):
 *   - every route derives the caller from the request context and denies an
 *     absent/falsy userId with a 401 BEFORE any resource lookup;
 *   - access is re-checked PER MESSAGE (row level), so an id the caller does
 *     not own is a 404 — never a 403, which would confirm the id exists;
 *   - a denied POST must not reach the provider and must not write a row.
 *
 * Resource contract: one fresh in-memory DB per test (createTestDb in
 * beforeEach), destroyed in afterEach; the provider-registry name is unique
 * per run and unregistered in afterEach; requests go through app.handle(),
 * no listener is bound; no files.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { translateMessageToLocale, } from "../../chat/message-translations";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { ChatParticipantRole, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, LLMProvider, } from "../../generation/providers/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { translationRoutes, } from "./translations";

const RUN_ID = randomUUID().slice(0, 8,);
const PROVIDER = `mtr-provider-${RUN_ID}`;
const MODEL = "mtr-model";

/** Provider `complete` invocations in the current test — the outbound-call counter. */
let providerCalls = 0;

/** */
function makeConfig(): Config {
  const defaults = createConfigSchema().defaults as unknown as {
    generation: Record<string, unknown>;
  };

  defaults.generation.defaultProvider = PROVIDER;
  defaults.generation.defaultModels = { [PROVIDER]: MODEL, };
  return defaults as unknown as Config;
}

/** `userId: null` builds the unauthenticated caller (no id in the context). */
function makeApp(db: Kysely<DB>, userId: string | null,) {
  const config = makeConfig();
  return new Elysia()
    .derive(() => ({ userId, userRole: userId === null ? null : "user", }))
    .use(translationRoutes({ database: db, config, },),);
}

describe("message translation routes", () => {
  let fixture: TestDb;
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  const chatId = randomUUID();
  let messageId: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    providerCalls = 0;
    registerProvider(PROVIDER, {
      capabilities: { label: "MTR Provider", streaming: false, },
      complete: async (_req: GenerateRequest,) => {
        providerCalls++;
        return { content: "hola", };
      },
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider,);

    const db = fixture.db;
    await insertUsers(db, `mtr-o-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertUsers(db, `mtr-x-${outsiderId}`, "Outider", { id: outsiderId, } as never,);
    await insertActors(db, "Outider", { id: outsiderId, user_id: outsiderId, owner_id: outsiderId, } as never,);
    await insertChats(db, "MTR Chat", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, },);
    messageId = await insertMessages(db, chatId, ownerId, MessageRole.Assistant, "hello world",);
  },);

  afterEach(async () => {
    unregisterProvider(PROVIDER,);
    await destroyTestDb(fixture,);
  },);

  test("list returns an empty array before any translation", async () => {
    const res = await makeApp(fixture.db, ownerId,).handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`,),
    );

    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("foreign message id is a 404, never a 403 leak", async () => {
    const res = await makeApp(fixture.db, outsiderId,).handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("GET by locale 404s on a missing variant", async () => {
    const res = await makeApp(fixture.db, ownerId,).handle(
      new Request(`http://localhost/api/messages/${messageId}/translations/es`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST with an unknown locale is a 400 before any provider call", async () => {
    const res = await makeApp(fixture.db, ownerId,).handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "klingon", },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect(providerCalls,).toBe(0,);
  });

  test("POST on an undecryptable message 422s without a provider call", async () => {
    // Corrupt the row: claims gzip encoding but the body is not gzip →
    // decodeContent throws inside resolveMessageContent.
    await fixture.db.updateTable("messages",)
      .set({ content: "hello world", content_encoding: "gzip", key_id: null, },)
      .where("id", "=", messageId,)
      .execute();

    const res = await makeApp(fixture.db, ownerId,).handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "es", },),
      },),
    );

    // The old behaviour fell back to the raw ciphertext and shipped it to
    // the MT provider; the fix fails the request instead.
    expect(res.status,).toBe(422,);
    expect(providerCalls,).toBe(0,);
    const rows = await fixture.db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", messageId,).execute();

    expect(rows,).toHaveLength(0,);
  });

  test("POST with a well-formed non-catalog locale is accepted (not a 400)", async () => {
    const res = await makeApp(fixture.db, ownerId,).handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "tlh", },),
      },),
    );

    // Boundary accepts any well-formed BCP-47 tag; the outcome (stored row or
    // heuristic skip) is a 200 body, never a validation rejection.
    expect(res.status,).toBe(200,);
    const body = await res.json() as { locale?: string; skipped?: boolean };
    expect(body.locale === "tlh" || body.skipped === true,).toBe(true,);
  });

  test("POST translates on demand and re-POST is idempotent; GET serves the variant", async () => {
    const app = makeApp(fixture.db, ownerId,);
    const post = (locale: string,): Promise<Response> =>
      app.handle(
        new Request(`http://localhost/api/messages/${messageId}/translations`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ locale, },),
        },),
      );

    const first = await post("es",);
    expect(first.status,).toBe(200,);
    const body = await first.json() as { locale?: string; content?: string; skipped?: boolean };
    expect(body.skipped,).toBeUndefined();
    expect(body.locale,).toBe("es",);
    expect(body.content,).toBe("hola",);
    // The counter IS the outbound-call seam the denial tests assert on: if
    // this ever reads 0, those denials would be passing vacuously.
    expect(providerCalls,).toBeGreaterThan(0,);

    await post("es",);
    const rows = await fixture.db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", messageId,).execute();

    expect(rows,).toHaveLength(1,);

    const got = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/translations/es`,),
    );

    expect(got.status,).toBe(200,);
    const single = await got.json() as { locale: string; content: string };
    expect(single,).toMatchObject({ locale: "es", content: "hola", },);

    const list = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`,),
    );

    const views = await list.json() as { locale: string }[];
    expect(views,).toHaveLength(1,);
  });

  test("on-demand service path is reused (translateMessageToLocale) for the stored row", async () => {
    // Pre-store a variant through the service; the GET route must decrypt
    // through the message content path (identity here).
    await translateMessageToLocale(fixture.db, makeConfig(), {
      messageId,
      chatId,
      actorId: ownerId,
      userId: ownerId,
      plaintext: "hello world",
      locale: "fr",
    },);

    const res = await makeApp(fixture.db, ownerId,).handle(
      new Request(`http://localhost/api/messages/${messageId}/translations/fr`,),
    );

    expect(res.status,).toBe(200,);
    expect(await res.json(),).toMatchObject({ locale: "fr", content: "hola", },);
  });

  // -- authorization: default-deny -------------------------------

  test("an unauthenticated caller is a 401 on every translation route", async () => {
    const app = makeApp(fixture.db, null,);

    const list = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`,),
    );

    expect(list.status,).toBe(401,);

    const one = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/translations/es`,),
    );

    expect(one.status,).toBe(401,);

    const post = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "es", },),
      },),
    );

    expect(post.status,).toBe(401,);

    // Denied before any resource lookup: no provider call, no stored row.
    expect(providerCalls,).toBe(0,);
    const rows = await fixture.db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", messageId,).execute();

    expect(rows,).toHaveLength(0,);
  });

  test("a foreign message id is a 404 on the by-locale and POST routes too", async () => {
    const app = makeApp(fixture.db, outsiderId,);

    const one = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/translations/es`,),
    );

    expect(one.status,).toBe(404,);

    const post = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/translations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "es", },),
      },),
    );

    expect(post.status,).toBe(404,);

    // Row-level denial: the write path must not translate a message the
    // caller cannot read, and must not store a row for it.
    expect(providerCalls,).toBe(0,);
    const rows = await fixture.db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", messageId,).execute();

    expect(rows,).toHaveLength(0,);
  });

  test("an unknown message id is a 404 for an authenticated caller, not a 500", async () => {
    const res = await makeApp(fixture.db, ownerId,).handle(
      new Request(`http://localhost/api/messages/${randomUUID()}/translations`,),
    );

    expect(res.status,).toBe(404,);
  });
});

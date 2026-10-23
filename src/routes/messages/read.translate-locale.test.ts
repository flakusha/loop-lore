// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-time translation negotiation on the messages list endpoint:
 * `?translateLocale=<locale|auto>` attaches the matching
 * `message_translations` row per message; default payloads (no param) are
 * unchanged. Lookup canonicalizes BCP-47 tags so `en-us` matches a row
 * stored as `en-US`.
 *
 * Resource contract: one fresh in-memory DB per test (createTestDb in
 * beforeEach), destroyed in afterEach; no provider-registry entries, no
 * files, no ports.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertChats,
  insertMessages,
  insertMessageTranslations,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { readRoutes, } from "./read";

const testConfig = {} as unknown as Config;

/** */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: `test-read-translate-${uid()}`, },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(readRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}

/** */
interface ListResult {
  status: number;
  rows: Record<string, unknown>[];
}

/** */
describe("messages list translateLocale negotiation", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;
  const owner = uid();
  let chatId: string;
  let enMessageId: string;
  let esMessageId: string;
  let bareMessageId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
    db = fixture.db;

    await insertUsers(db, `user-${owner}`, "Owner", { id: owner, } as never,);
    await db.insertInto("actors",).values({
      id: owner,
      actor_type: "user",
      display_name: "Owner",
      user_id: owner,
      owner_id: owner,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    chatId = uid();
    // Chat content-language "en": the auto-resolution chat rung.
    await insertChats(db, "Negotiation Chat", owner, {
      id: chatId,
      gm_config: JSON.stringify({ contentLanguage: "en", },),
    } as never,);

    enMessageId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "hello", { id: enMessageId, } as never,);
    esMessageId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "hola", { id: esMessageId, } as never,);
    bareMessageId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "no variants", {
      id: bareMessageId,
    } as never,);

    // Canonical storage form carries region case; the es row must NOT match
    // an en lookup.
    await insertMessageTranslations(db, enMessageId, "en-US", "hello (en)", new Date().toISOString(),);
    await insertMessageTranslations(db, esMessageId, "es", "hola (es)", new Date().toISOString(),);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  /** */
  async function listMessages(query: string,): Promise<ListResult> {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages${query}`,),
    );

    const body = await res.json() as { data: Record<string, unknown>[] };
    return { status: res.status, rows: body.data, };
  }

  test("explicit locale (case-insensitive) attaches the matching row only", async () => {
    const { status, rows, } = await listMessages("?translateLocale=en-us",);
    expect(status,).toBe(200,);

    const byId = new Map(rows.map((row,) => [row["id"] as string, row,]),);
    const enRow = byId.get(enMessageId,)!;
    expect(enRow["translation"],).toEqual({ locale: "en-US", content: "hello (en)", },);
    expect(byId.get(esMessageId,)!["translation"],).toBeUndefined();
    expect(byId.get(bareMessageId,)!["translation"],).toBeUndefined();
  });

  test("no param leaves default payloads unchanged", async () => {
    const { status, rows, } = await listMessages("",);
    expect(status,).toBe(200,);
    for (const row of rows) {
      expect(row,).not.toHaveProperty("translation",);
    }
  });

  test("auto resolves the requester display locale through the precedence chain", async () => {
    // Chat contentLanguage "en"; matching is exact after canonicalization,
    // so the en-US row does NOT match the bare "en" resolution.
    const first = await listMessages("?translateLocale=auto",);
    expect(first.status,).toBe(200,);
    const byId = new Map(first.rows.map((row,) => [row["id"] as string, row,]),);
    expect(byId.get(enMessageId,)!["translation"],).toBeUndefined();
    expect(byId.get(esMessageId,)!["translation"],).toBeUndefined();

    // Store a row under the resolved locale; auto must now attach it.
    await insertMessageTranslations(db, esMessageId, "en", "hola (en)", new Date().toISOString(),);
    const again = await listMessages("?translateLocale=auto",);
    const byId2 = new Map(again.rows.map((row,) => [row["id"] as string, row,]),);
    expect(byId2.get(esMessageId,)!["translation"],).toEqual({
      locale: "en",
      content: "hola (en)",
    },);
  });

  test("a malformed locale attaches nothing and still serves the page", async () => {
    const { status, rows, } = await listMessages("?translateLocale=klingon!",);
    expect(status,).toBe(200,);
    for (const row of rows) {
      expect(row,).not.toHaveProperty("translation",);
    }
  });
});

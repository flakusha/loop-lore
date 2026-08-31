/**
 * Tests for i18n routes (locale list + user locale preference).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { i18nRoutes, } from "./i18n";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-i18n", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(i18nRoutes({ database: db, },),);
}

interface LocaleEntry {
  id: string;
  name: string;
  nativeName: string;
  direction: string;
}

interface LocaleListBody {
  locales?: LocaleEntry[];
  default?: string;
  error?: string;
  locale?: string;
}

describe("i18n routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("GET /i18n/locales lists supported locales with metadata", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/i18n/locales",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as LocaleListBody;
    expect(body.default,).toBe("en",);
    expect(body.locales?.length,).toBeGreaterThanOrEqual(10,);

    const en = body.locales?.find((l,) => l.id === "en");
    expect(en,).toEqual({ id: "en", name: "English", nativeName: "English", direction: "ltr", },);

    const ar = body.locales?.find((l,) => l.id === "ar");
    expect(ar?.direction,).toBe("rtl",);

    const ja = body.locales?.find((l,) => l.id === "ja");
    expect(ja?.nativeName,).toBe("日本語",);
  });

  test("GET /i18n/locales works without auth", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/api/i18n/locales",),
    );
    expect(res.status,).toBe(200,);
  });

  test("PATCH /i18n/locale requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/api/i18n/locale", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "ja", },),
      },),
    );
    expect(res.status,).toBe(401,);
    expect((await res.json() as LocaleListBody).error,).toBeDefined();
  });

  test("PATCH /i18n/locale rejects missing locale field at schema level", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/i18n/locale", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("PATCH /i18n/locale rejects empty locale", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/i18n/locale", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "", },),
      },),
    );
    expect(res.status,).toBe(400,);
    expect((await res.json() as LocaleListBody).error,).toBeDefined();
  });

  test("PATCH /i18n/locale rejects unsupported locale", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/i18n/locale", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "xx", },),
      },),
    );
    expect(res.status,).toBe(400,);
    expect((await res.json() as LocaleListBody).error,).toBeDefined();
  });

  test("PATCH /i18n/locale persists locale in user settings", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/i18n/locale", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "ja", },),
      },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as LocaleListBody).locale,).toBe("ja",);

    const user = await db
      .selectFrom("users",)
      .select("settings",)
      .where("id", "=", "user1",)
      .executeTakeFirst();
    const settings = JSON.parse(user?.settings ?? "{}",) as Record<string, unknown>;
    expect(settings.locale,).toBe("ja",);
  });

  test("PATCH /i18n/locale preserves existing settings", async () => {
    await db
      .updateTable("users",)
      .set({ settings: JSON.stringify({ theme: "dark", locale: "en", },), },)
      .where("id", "=", "user2",)
      .execute();

    const res = await makeApp(db, "user2",).handle(
      new Request("http://localhost/api/i18n/locale", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locale: "fr", },),
      },),
    );
    expect(res.status,).toBe(200,);

    const user = await db
      .selectFrom("users",)
      .select("settings",)
      .where("id", "=", "user2",)
      .executeTakeFirst();
    const settings = JSON.parse(user?.settings ?? "{}",) as Record<string, unknown>;
    expect(settings.locale,).toBe("fr",);
    expect(settings.theme,).toBe("dark",);
  });
});

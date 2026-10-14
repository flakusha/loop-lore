// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 giwt Contributors

/**
 * The URL-import SSRF guard: a hostname that LOOKS public but resolves to a
 * private address must be rejected. The old guard compared the hostname string
 * only, so `https://public.example.com` pointing at 10.x reached the fetch.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import type { HostResolver, } from "../../utils/url-validation";
import { importRoutes, } from "./import";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

describe("character-io import/url SSRF guard", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertActors(db, "User One", {
      id: ACTOR_ID as never,
      owner_id: "user1" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  /**
   * @param resolve - resolver seam standing in for DNS
   */
  function app(resolve: HostResolver,) {
    const server = new Elysia({ name: `import-ssrf-${Math.random()}`, },);
    server.derive(() => ({ userId: "user1", }));
    return server.use(importRoutes({ database: db, resolveHost: resolve, },),);
  }

  /**
   * @param target - URL to try to import from
   * @param resolve - resolver seam standing in for DNS
   */
  async function importFrom(target: string, resolve: HostResolver,) {
    return await app(resolve,).handle(
      new Request(`http://localhost/api/actors/${ACTOR_ID}/systems/import/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: target, },),
      },),
    );
  }

  test("rejects a public-looking hostname that resolves to a private address", async () => {
    const res = await importFrom(
      "https://totally-public.example.com/card.json",
      () => Promise.resolve(["10.1.2.3",],),
    );

    expect(res.status,).toBe(400,);
    const body = await res.text();
    expect(body,).toContain("10.1.2.3",);
  });

  test("rejects a public-looking hostname that resolves to the metadata IP", async () => {
    const res = await importFrom(
      "https://metadata.example.com/latest/",
      () => Promise.resolve(["169.254.169.254",],),
    );

    expect(res.status,).toBe(400,);
    expect(await res.text(),).toContain("169.254.169.254",);
  });

  test("rejects a literal loopback URL", async () => {
    const res = await importFrom("http://127.0.0.1:9999/card.json", () => Promise.resolve([],),);
    expect(res.status,).toBe(400,);
  });

  test("rejects a non-http scheme", async () => {
    const res = await importFrom("file:///etc/passwd", () => Promise.resolve(["93.184.216.34",],),);
    expect(res.status,).toBe(400,);
  });

  test("gets past the guard for a genuinely public host (fails later at fetch, not 400-private)", async () => {
    const res = await importFrom(
      "https://cards.example.com/card.json",
      () => Promise.resolve(["93.184.216.34",],),
    );

    // The guard lets this through; the fetch itself then fails in the sandbox.
    // Either way it must NOT be the private-address rejection.
    const body = await res.text();
    expect(body,).not.toContain("private address",);
  });
});

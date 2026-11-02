// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 giwt Contributors
/**
 * The URL-import SSRF guard: a hostname that LOOKS public but resolves to a
 * private address must be rejected. The old guard compared the hostname string
 * only, so `https://public.example.com` pointing at 10.x reached the fetch.
 *
 * Resource contract (parallel-safe): the guard's DNS is injected per call via
 * the `resolveHost` seam, and `globalThis.fetch` is swapped for an
 * instant-throwing stub in `beforeEach` and restored in `afterEach` — the
 * public-host case proves the guard PASSES and the failure happens at the
 * fetch, without any real network, DNS, ports, or sleeps. The database is a
 * per-run createTestDb, closed in afterAll.
 */
import type { CharacterSystemsExport, } from "../../characters/exporters/character-systems";
import type { DB, } from "../../db/schema";
import type { Database, } from "bun:sqlite";
import type { HostResolver, } from "../../utils/url-validation";
import type { Kysely, } from "kysely";
import { Elysia, } from "elysia";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, } from "../../test-utils/create-test-db";
import { importRoutes, } from "./import";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";

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

  // The fetch stub is per-test owned: every dial the route makes after the
  // guard throws instantly, so no test touches real DNS or the network.
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async () => {
      throw new Error("network disabled in test",);
    }) as unknown as typeof fetch;
  },);

  afterEach(() => {
    globalThis.fetch = realFetch;
  },);

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

  // The route's post-guard fetch (import.ts safeFetch) must not leave the
  // machine: real DNS/TLS to a public host inside bun's 5s per-test runner
  // budget is exactly the parallel-load kill this suite suffers. Swap
  // globalThis.fetch for the duration of the call — the same seam the
  // safe-fetch tests use (packages/core/src/utils/safe-fetch/fetch.test.ts)
  // — and restore it even on failure. The SSRF guard above still exercises
  // the real validateFetchUrl logic; only the outbound fetch is stubbed.
  const originalFetch = globalThis.fetch;

  test("gets past the guard for a genuinely public host (fails later at fetch, not 400-private)", async () => {
    const exportPayload: CharacterSystemsExport = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      characterId: ACTOR_ID,
    };

    globalThis.fetch = (() => Promise.resolve(Response.json(exportPayload,),)) as typeof fetch;
    try {
      const res = await importFrom(
        "https://cards.example.com/card.json",
        () => Promise.resolve(["93.184.216.34",],),
      );

      // The guard lets this through; the stubbed fetch hands back a minimal
      // valid export. Either way the body must NOT be the private-address
      // rejection.
      const body = await res.text();
      expect(body,).not.toContain("private address",);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

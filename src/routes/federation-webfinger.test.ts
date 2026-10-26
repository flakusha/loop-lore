// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * WebFinger + host-meta discovery routes.
 *
 * Regression: this server published no discovery surface at all — no
 * `/.well-known/host-meta`, no `/.well-known/webfinger` — so a remote instance
 * could not resolve a local actor, and this server's own resolver had no
 * published endpoint to be compared against. Both routes are gated by
 * `config.federation.enabled` and answer only for federation-consented
 * characters of this origin.
 */
import { describe, expect, test, } from "bun:test";
import type { Config, FederationConfig, } from "../config/schema";
import type { Db, } from "../db";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertCharacters, insertUsers, } from "../test-utils/insert-helpers";
import { federationRoutes, } from "./federation";

const ORIGIN = "https://lore.example";

/** @param federation */
function configWith(federation: Partial<FederationConfig>,): Config {
  return {
    server: {
      host: "lore.example",
      port: 3000,
      publicOrigin: ORIGIN,
      tls: undefined,
    },
    auth: { registrationOpen: false, },
    federation: {
      enabled: federation.enabled ?? true,
      seeds: [],
      peers: [],
      meshPsk: "",
      duplication: { mode: "trusted", peers: [], },
      workloadOffload: federation.workloadOffload,
    },
  } as unknown as Config;
}

/** Fresh migrated DB plus one owner user. */
async function dbWithOwner(): Promise<{ db: Db; ownerId: string }> {
  const { db, } = await createTestDb();
  const ownerId = await insertUsers(db, "owner-1", "Owner",);
  return { db, ownerId, };
}

/** @param resource */
function webfingerUrl(resource: string,): string {
  return `${ORIGIN}/.well-known/webfinger?resource=${encodeURIComponent(resource,)}`;
}

describe("federation discovery routes — gating", () => {
  test("disabled: host-meta and webfinger are unmounted", async () => {
    const { db, } = await dbWithOwner();
    const app = federationRoutes({ config: configWith({ enabled: false, },), database: db, },);

    const hostMeta = await app.handle(new Request(`${ORIGIN}/.well-known/host-meta`,),);
    const webfinger = await app.handle(new Request(webfingerUrl("acct:alice@lore.example",),),);

    expect(hostMeta.status,).toBe(404,);
    expect(webfinger.status,).toBe(404,);
  });
});

describe("host-meta", () => {
  test("advertises this instance's WebFinger lrdd template", async () => {
    const { db, } = await dbWithOwner();
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(`${ORIGIN}/.well-known/host-meta`,),);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("application/xrd+xml",);
    const body = await res.text();
    expect(body,).toContain(`template="${ORIGIN}/.well-known/webfinger?resource={uri}"`,);
  });

  test("leaks no actor names, counts, or topology", async () => {
    const { db, ownerId, } = await dbWithOwner();
    await insertCharacters(db, ownerId, "Alice", { federation_consent: 1, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const body = await (await app.handle(new Request(`${ORIGIN}/.well-known/host-meta`,),)).text();

    expect(body,).not.toContain("alice",);
    expect(body,).not.toContain("users",);
  });
});

describe("webfinger", () => {
  test("resolves an acct: handle of a consented character", async () => {
    const { db, ownerId, } = await dbWithOwner();
    const characterId = await insertCharacters(db, ownerId, "Alice", { federation_consent: 1, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(webfingerUrl("acct:alice@lore.example",),),);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("application/jrd+json",);
    const jrd = (await res.json()) as { subject: string; links: { rel: string; href: string }[] };
    expect(jrd.subject,).toBe("acct:alice@lore.example",);
    expect(jrd.links[0]?.rel,).toBe("self",);
    expect(jrd.links[0]?.href,).toBe(`${ORIGIN}/users/${encodeURIComponent(characterId,)}`,);
  });

  test("resolves the actor URI form of the same character", async () => {
    const { db, ownerId, } = await dbWithOwner();
    const characterId = await insertCharacters(db, ownerId, "Alice", { federation_consent: 1, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const actorUri = `${ORIGIN}/users/${encodeURIComponent(characterId,)}`;
    const res = await app.handle(new Request(webfingerUrl(actorUri,),),);

    expect(res.status,).toBe(200,);
    const jrd = (await res.json()) as { subject: string };
    expect(jrd.subject,).toBe("acct:alice@lore.example",);
  });

  test("404s for a character whose owner did not consent", async () => {
    const { db, ownerId, } = await dbWithOwner();
    await insertCharacters(db, ownerId, "Private", { federation_consent: 0, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(webfingerUrl("acct:private@lore.example",),),);

    expect(res.status,).toBe(404,);
  });

  test("404s for a foreign host rather than vouching for it", async () => {
    const { db, ownerId, } = await dbWithOwner();
    await insertCharacters(db, ownerId, "Alice", { federation_consent: 1, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(webfingerUrl("acct:alice@elsewhere.example",),),);

    expect(res.status,).toBe(404,);
  });

  test("404s for a slug shared by two consented characters", async () => {
    const { db, } = await dbWithOwner();
    const firstOwner = await insertUsers(db, "owner-2", "Second Owner",);
    await insertCharacters(db, firstOwner, "Alice", { federation_consent: 1, },);
    const secondOwner = await insertUsers(db, "owner-3", "Third Owner",);
    await insertCharacters(db, secondOwner, "Alice", { federation_consent: 1, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(webfingerUrl("acct:alice@lore.example",),),);

    expect(res.status,).toBe(404,);
  });

  test("derives the handle from the character name through slugifyName", async () => {
    const { db, ownerId, } = await dbWithOwner();
    await insertCharacters(db, ownerId, "Dr. Thorne", { federation_consent: 1, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(webfingerUrl("acct:dr-thorne@lore.example",),),);

    expect(res.status,).toBe(200,);
    const jrd = (await res.json()) as { subject: string };
    expect(jrd.subject,).toBe("acct:dr-thorne@lore.example",);
  });

  test("a malformed actor URI is a miss, not a server error", async () => {
    const { db, } = await dbWithOwner();
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(webfingerUrl(`${ORIGIN}/users/%ZZ`,),),);

    expect(res.status,).toBe(404,);
  });

  test("does not vouch for a foreign actor URI", async () => {
    const { db, ownerId, } = await dbWithOwner();
    const characterId = await insertCharacters(db, ownerId, "Alice", { federation_consent: 1, },);
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(
      new Request(webfingerUrl(`https://elsewhere.example/users/${encodeURIComponent(characterId,)}`,),),
    );

    expect(res.status,).toBe(404,);
  });

  test("requires the resource query parameter", async () => {
    const { db, } = await dbWithOwner();
    const app = federationRoutes({ config: configWith({},), database: db, },);

    const res = await app.handle(new Request(`${ORIGIN}/.well-known/webfinger`,),);

    expect(res.status,).toBe(400,);
  });
});

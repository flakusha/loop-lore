/**
 * Tests for views/plugin-dynamic dynamicRoutes (htmx partial endpoints).
 *
 * Resource contract: FILE owns exactly one :memory: SQLite DB (created in beforeAll,
 * seeded with fixed ids owner/actor-aria/world-elm/chat-a/g1, closed in afterAll).
 * Tests share that DB; the "characters grid — JSON view-model negotiation" block
 * inserts NOTHING and reads only the seeded rows — order-independent within the block
 * and against the rest of the file.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssets,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { safeJsonParse, } from "../../utils";
import { dynamicRoutes, } from "./plugin-dynamic";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-plugin-dynamic", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }

  return app.use(dynamicRoutes(db,),);
}

describe("views/plugin-dynamic — dynamicRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertActors(db, "Aria", {
      id: "actor-aria" as never,
      owner_id: "owner",
      actor_type: "character" as never,
    },);

    await insertWorlds(db, "owner", "Elm", { id: "world-elm" as never, },);
    await insertChats(db, "Alpha Chat", "owner", { id: "chat-a" as never, world_id: "world-elm", },);
    await insertAssets(db, "owner", "x.png", "image/png", "image", 100, "p/x", {
      id: "g1" as never,
      visibility: "public" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  test("non-htmx requests redirect to /views/", async () => {
    const res = await makeApp(db,).handle(new Request("http://localhost/dynamic/characters/grid",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("location",),).toBe("/views/",);
  });

  test("every dynamic endpoint redirects non-htmx requests", async () => {
    const endpoints = [
      "/dynamic/characters/grid",
      "/dynamic/gallery/grid",
      "/dynamic/worlds/list",
      "/dynamic/gallery/search",
      "/dynamic/characters/search",
      "/dynamic/worlds/search",
      "/dynamic/chats/list",
      "/dynamic/chats/search",
      "/dynamic/worlds/world-elm/detail",
      "/dynamic/characters/actor-aria/edit-form",
      "/dynamic/characters/actor-aria/chat-list",
    ];

    for (const path of endpoints) {
      const res = await makeApp(db, "owner", "user",).handle(new Request(`http://localhost${path}`,),);
      expect(res.status,).toBe(302,);
      expect(res.headers.get("location",),).toBe("/views/",);
    }
  });

  test("characters grid renders with HX-Request", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/characters/grid", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("actor-aria",);
  });

  test("gallery grid renders with HX-Request", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/gallery/grid", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("g1",);
  });

  test("worlds search scopes to owner", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/worlds/search", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("world-elm",);
  });

  test("worlds list renders with HX-Request", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/worlds/list", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("world-elm",);
  });

  test("gallery search renders with HX-Request", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/gallery/search", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("asset-card-g1",);
  });

  test("gallery search serves anonymous callers like the grid (BUG-gallery-search-401s-anonymous-users-while-grid-serves-them)", async () => {
    const app = makeApp(db,);
    const gridRes = await app.handle(
      new Request("http://localhost/dynamic/gallery/grid", { headers: { "HX-Request": "true", }, },),
    );

    const searchRes = await app.handle(
      new Request("http://localhost/dynamic/gallery/search", { headers: { "HX-Request": "true", }, },),
    );

    expect(gridRes.status,).toBe(200,);
    expect(searchRes.status,).toBe(200,);
    expect(await searchRes.text(),).toContain("asset-card-g1",);
  });

  test("characters search renders with HX-Request", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/characters/search?q=aria", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("actor-aria",);
  });

  test("chats list renders with HX-Request", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/chats/list", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("chat-a",);
  });

  test("chats search renders with HX-Request", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/chats/search?q=alpha", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("chat-a",);
  });

  test("chats list denies unauthenticated JSON callers", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/chats/list", { headers: { Accept: "application/json", }, },),
    );

    expect(res.status,).toBe(401,);
  });

  test("chats list JSON is scoped to the caller", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request("http://localhost/dynamic/chats/list", { headers: { Accept: "application/json", }, },),
    );

    expect(res.status,).toBe(200,);
    const body = safeJsonParse<{ chats: unknown[] }>(await res.text(),);
    expect(body.ok && body.value.chats,).toEqual([],);
  });

  test("chats search JSON is scoped to the caller", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request("http://localhost/dynamic/chats/search?q=alpha", { headers: { Accept: "application/json", }, },),
    );

    expect(res.status,).toBe(200,);
    const body = safeJsonParse<{ chats: unknown[] }>(await res.text(),);
    expect(body.ok && body.value.chats,).toEqual([],);
  });

  test("world detail renders for owner", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/worlds/world-elm/detail", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("Elm",);
  });

  test("world detail visible to non-owner (public world)", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request("http://localhost/dynamic/worlds/world-elm/detail", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
  });

  test("world detail renders not-found state for unknown world", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/dynamic/worlds/does-not-exist/detail", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("World not found",);
  });

  test("character edit-form renders with HX-Request", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/characters/actor-aria/edit-form", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("character-edit-form",);
  });

  test("character chat-list renders with HX-Request", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/characters/actor-aria/chat-list", { headers: { "HX-Request": "true", }, },),
    );

    expect(res.status,).toBe(200,);
  });

  /**
   * Owns nothing beyond the file-level seeded DB read-only view — no clock, no network.
   */
  describe("characters grid — JSON view-model negotiation", () => {
    /**
     * @param headers
     */
    function gridRequest(headers: Record<string, string>,): Request {
      return new Request("http://localhost/dynamic/characters/grid", { headers, },);
    }

    test("Accept: application/json returns the view-model and nothing else", async () => {
      const res = await makeApp(db, "owner", "user",).handle(
        gridRequest({ "Accept": "application/json", },),
      );

      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("application/json",);

      const body = await res.text();
      expect(body,).not.toContain("<div",);
      expect(body,).not.toContain("character-card",);
    });

    test("JSON and the htmx fragment agree on rows, counts and field values", async () => {
      const jsonRes = await makeApp(db, "owner", "user",).handle(
        gridRequest({ "Accept": "application/json", },),
      );

      const htmlRes = await makeApp(db, "owner", "user",).handle(
        gridRequest({ "HX-Request": "true", },),
      );

      const parsed = safeJsonParse<CharactersGridBody>(await jsonRes.text(),);
      expect(parsed.ok,).toBe(true,);
      if (!parsed.ok) {
        return;
      }

      const { characters, } = parsed.value;
      const html = await htmlRes.text();

      expect(characters.length,).toBeGreaterThan(0,);
      const renderedCards = html.match(/data-testid="character-card-/g,) ?? [];
      expect(renderedCards.length,).toBe(characters.length,);

      for (const character of characters) {
        expect(html,).toContain(`data-testid="character-card-${character.id}"`,);
        expect(html,).toContain(`window.selectCharacterCard('${character.id}')`,);
        expect(html,).toContain(escapeHtmlForTest(character.displayName,),);
        expect(html,).toContain(escapeHtmlForTest(character.description,),);
        expect(html,).toContain(character.reviewState.replace(/_/g, " ",),);
        if (character.avatarUrl) {
          expect(html,).toContain(`src="${character.avatarUrl}"`,);
        }
      }
    });

    test("an explicit text/html outranks a wildcard application/json and keeps the redirect", async () => {
      const res = await makeApp(db, "owner", "user",).handle(
        gridRequest({ "Accept": "text/html, application/json;q=0.9", },),
      );

      expect(res.status,).toBe(302,);
      expect(res.headers.get("location",),).toBe("/views/",);
    });

    test("an any-media wildcard without HX-Request keeps the redirect", async () => {
      const res = await makeApp(db, "owner", "user",).handle(gridRequest({ "Accept": "*/*", },),);

      expect(res.status,).toBe(302,);
    });

    test("an explicit JSON Accept outranks the HX-Request fragment hint", async () => {
      const res = await makeApp(db, "owner", "user",).handle(
        gridRequest({ "HX-Request": "true", "Accept": "application/json", },),
      );

      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("application/json",);
    });

    test("an htmx request with a wildcard Accept keeps the html fragment", async () => {
      const res = await makeApp(db, "owner", "user",).handle(
        gridRequest({ "HX-Request": "true", "Accept": "*/*", },),
      );

      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("text/html; charset=utf-8",);
      expect(await res.text(),).toContain("character-card-",);
    });
  });

  /**
   * JSON negotiation on the four dynamic endpoints that own a view-model loader.
   * Reads only the file-seeded rows (chat-a, g1); inserts nothing.
   */
  describe("dynamic endpoints — JSON view-model negotiation", () => {
    const jsonEndpoints = [
      "/dynamic/chats/list",
      "/dynamic/chats/search",
      "/dynamic/gallery/grid",
      "/dynamic/gallery/search",
    ];

    test("an explicit JSON Accept returns the view-model and no markup", async () => {
      for (const path of jsonEndpoints) {
        const res = await makeApp(db, "owner", "user",).handle(
          new Request(`http://localhost${path}`, { headers: { "Accept": "application/json", }, },),
        );

        expect(res.status,).toBe(200,);
        expect(res.headers.get("content-type",),).toBe("application/json",);
        expect(await res.text(),).not.toContain("<div",);
      }
    });

    test("an explicit JSON Accept outranks the HX-Request fragment hint", async () => {
      for (const path of jsonEndpoints) {
        const res = await makeApp(db, "owner", "user",).handle(
          new Request(`http://localhost${path}`, {
            headers: { "HX-Request": "true", "Accept": "application/json", },
          },),
        );

        expect(res.status,).toBe(200,);
        expect(res.headers.get("content-type",),).toBe("application/json",);
      }
    });

    test("chats list JSON and htmx fragment agree on the seeded rows", async () => {
      const jsonRes = await makeApp(db, "owner", "user",).handle(
        new Request("http://localhost/dynamic/chats/list", { headers: { "Accept": "application/json", }, },),
      );

      const htmlRes = await makeApp(db, "owner", "user",).handle(
        new Request("http://localhost/dynamic/chats/list", { headers: { "HX-Request": "true", }, },),
      );

      const parsed = safeJsonParse<ChatsListBody>(await jsonRes.text(),);
      expect(parsed.ok,).toBe(true,);
      if (!parsed.ok) {
        return;
      }

      const html = await htmlRes.text();
      const renderedCards = html.match(/data-testid="chat-card-/g,) ?? [];
      expect(renderedCards.length,).toBe(parsed.value.chats.length,);
      for (const chat of parsed.value.chats) {
        expect(html,).toContain(`data-testid="chat-card-${chat.id}"`,);
      }

      expect(parsed.value.chats.some((chat,) => chat.id === "chat-a"),).toBe(true,);
    });

    test("gallery grid JSON and htmx fragment agree on the seeded asset", async () => {
      const jsonRes = await makeApp(db, "owner", "user",).handle(
        new Request("http://localhost/dynamic/gallery/grid", { headers: { "Accept": "application/json", }, },),
      );

      const htmlRes = await makeApp(db, "owner", "user",).handle(
        new Request("http://localhost/dynamic/gallery/grid", { headers: { "HX-Request": "true", }, },),
      );

      const parsed = safeJsonParse<GalleryBody>(await jsonRes.text(),);
      expect(parsed.ok,).toBe(true,);
      if (!parsed.ok) {
        return;
      }

      const asset = parsed.value.assets.find((a,) => a.id === "g1");
      expect(asset,).toBeDefined();
      expect(asset?.thumbUrl,).toBe("/api/v1/assets/g1/thumb",);
      expect(await htmlRes.text(),).toContain('data-testid="asset-card-g1"',);
    });
  });
});

/** The JSON shape the chats list serves. */
interface ChatsListBody {
  chats: Array<{ id: string; name: string; isPinned: boolean }>;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/** The JSON shape the gallery grid/search serve. */
interface GalleryBody {
  assets: Array<{ id: string; filename: string; thumbUrl: string | null }>;
}

/** The JSON shape the characters grid serves. */
interface CharactersGridBody {
  characters: Array<{
    id: string;
    displayName: string;
    description: string;
    avatarUrl: string | null;
    reviewState: string;
  }>;
}

/**
 * Minimal HTML escaping mirroring `escapeHtml` — the parity test asserts the
 * markup renders the view-model's raw text escaped, not echoed verbatim.
 * @param str
 */
function escapeHtmlForTest(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

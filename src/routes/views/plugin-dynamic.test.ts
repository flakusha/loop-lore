/**
 * Tests for views/plugin-dynamic dynamicRoutes (htmx partial endpoints).
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
import { dynamicRoutes, } from "./plugin-dynamic";

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
    await insertAssets(db, "owner", "x.png", "image/png", "image", 100, "p/x", { id: "g1" as never, },);
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
    const res = await makeApp(db,).handle(
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
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/gallery/search", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
  });

  test("characters search renders with HX-Request", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/characters/search?q=aria", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("actor-aria",);
  });

  test("chats list renders with HX-Request", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/chats/list", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("chat-a",);
  });

  test("chats search renders with HX-Request", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/dynamic/chats/search?q=alpha", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
    const html = await res.text();
    expect(html,).toContain("chat-a",);
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
});

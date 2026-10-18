/**
 * SPDX-License-Identifier: LGPL-3.0-or-later
 * SPDX-FileCopyrightText: 2026 Loop Lore Contributors
 */

/**
 * E2E: `/dynamic/*` view-fragment authorization.
 *
 * These are server-rendered partials, not `/api/v1/*` routes, so the JSON
 * client wrapper never reaches them: negotiation is by `Accept` and
 * `HX-Request` headers on a bare `fetch`. Each negative case is paired with a
 * positive control (the owner reaches the same surface) so a 401 from
 * unrelated auth middleware cannot make the negative assertion pass
 * vacuously.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedCharacter, seedChat, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

/** Values only the owner may read — asserted absent from a stranger's response. */
const SECRETS = {
  systemPrompt: "You are a test character.",
  personality: "Helpful test personality",
  welcomeMessage: "SECRET_WELCOME_MESSAGE_TOKEN",
  scenario: "SECRET_SCENARIO_TOKEN",
  postHistory: "SECRET_POST_HISTORY_TOKEN",
} as const;

describe("Dynamic view authorization E2E", () => {
  let server: TestServer;
  let owner: ApiClient;
  let other: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    await seedUsers(server.db,);
    await seedCharacter(server.db,);
    await seedChat(server.db,);

    // The seeded character ships only a system_prompt and a personality; add
    // the remaining prompt fields so the edit-form case covers all of them.
    await server.db
      .updateTable("actors",)
      .set({
        welcome_message: SECRETS.welcomeMessage,
        scenario: SECRETS.scenario,
        post_history_instructions: SECRETS.postHistory,
      },)
      .where("id", "=", SEED.character.id,)
      .execute();

    await server.db
      .insertInto("users",)
      .values({
        id: "00000000-0000-4000-b000-000000000099",
        username: "e2eother",
        display_name: "E2E Other User",
        secret_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .onConflict((oc,) => oc.column("username",).doNothing())
      .execute();

    await server.db
      .insertInto("actors",)
      .values({
        id: "00000000-0000-4000-b000-000000000099",
        actor_type: "user",
        display_name: "E2E Other User",
        user_id: "00000000-0000-4000-b000-000000000099",
        owner_id: "00000000-0000-4000-b000-000000000099",
        settings: "{}",
        import_spec: "raw",
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();

    owner = createClient(server.url,);
    other = createClient(server.url,);

    expect(await owner.loginAs(SEED.user.username, SEED.user.password,),).toBe(true,);
    expect(await other.loginAs("e2eother", "password",),).toBe(true,);
  }, 30_000,);

  afterAll(async () => {
    await server.close();
  },);

  /** Bare GET so the `Accept` / `HX-Request` negotiation headers reach the route. */
  const rawGet = async (
    path: string,
    { token, accept, htmx, }: { token?: string | null; accept?: string; htmx?: boolean },
  ): Promise<{ status: number; body: string }> => {
    const headers: Record<string, string> = {};
    if (token) { headers["Cookie"] = `ll_token=${token}`; }
    if (accept) { headers["Accept"] = accept; }
    if (htmx) { headers["HX-Request"] = "true"; }

    const res = await fetch(`${server.url}${path}`, { headers, redirect: "manual", },);
    return { status: res.status, body: await res.text(), };
  };

  describe("/dynamic/chats/* — anonymous JSON", () => {
    test("an anonymous Accept: application/json list request is 401, not chat rows", async () => {
      const res = await rawGet("/dynamic/chats/list", { accept: "application/json", },);

      expect(res.status,).toBe(401,);
      expect(res.body,).not.toContain(SEED.chat.id,);
      expect(res.body,).not.toContain(SEED.chat.name,);
    });

    test("an anonymous Accept: application/json search request is 401, not chat rows", async () => {
      const res = await rawGet(`/dynamic/chats/search?q=${encodeURIComponent(SEED.chat.name,)}`, {
        accept: "application/json",
      },);

      expect(res.status,).toBe(401,);
      expect(res.body,).not.toContain(SEED.chat.id,);
      expect(res.body,).not.toContain(SEED.chat.name,);
    });

    test("the owner still reaches the same JSON surfaces (positive control)", async () => {
      const list = await rawGet("/dynamic/chats/list", {
        token: owner.token,
        accept: "application/json",
      },);

      expect(list.status,).toBe(200,);
      expect(list.body,).toContain(SEED.chat.id,);

      const search = await rawGet(`/dynamic/chats/search?q=${encodeURIComponent(SEED.chat.name,)}`, {
        token: owner.token,
        accept: "application/json",
      },);

      expect(search.status,).toBe(200,);
      expect(search.body,).toContain(SEED.chat.id,);
    });

    test("a stranger's chat list carries none of the owner's chats", async () => {
      const res = await rawGet("/dynamic/chats/list", { token: other.token, accept: "application/json", },);

      expect(res.status,).toBe(200,);
      expect(res.body,).not.toContain(SEED.chat.id,);
    });
  });

  describe("/dynamic/characters/* — ownership", () => {
    test("a stranger gets the not-found partial, never the prompt fields", async () => {
      const res = await rawGet(`/dynamic/characters/${SEED.character.id}/edit-form`, {
        token: other.token,
        htmx: true,
      },);

      expect(res.status,).toBe(200,);
      expect(res.body,).toContain("Character not found",);
      expect(res.body,).not.toContain("character-edit-form",);
      expect(res.body,).not.toContain(SECRETS.systemPrompt,);
      expect(res.body,).not.toContain(SECRETS.personality,);
      expect(res.body,).not.toContain(SECRETS.welcomeMessage,);
      expect(res.body,).not.toContain(SECRETS.scenario,);
      expect(res.body,).not.toContain(SECRETS.postHistory,);
    });

    test("the owner still gets the edit form (positive control)", async () => {
      const res = await rawGet(`/dynamic/characters/${SEED.character.id}/edit-form`, {
        token: owner.token,
        htmx: true,
      },);

      expect(res.status,).toBe(200,);
      expect(res.body,).toContain("character-edit-form",);
      expect(res.body,).toContain(SECRETS.systemPrompt,);
      expect(res.body,).toContain(SECRETS.welcomeMessage,);
    });

    test("a stranger's characters grid JSON omits foreign characters", async () => {
      const res = await rawGet("/dynamic/characters/grid", { token: other.token, accept: "application/json", },);

      expect(res.status,).toBe(200,);
      expect(res.body,).not.toContain(SEED.character.id,);
      expect(res.body,).not.toContain(SEED.character.name,);
    });

    test("the owner's characters grid JSON lists them (positive control)", async () => {
      const res = await rawGet("/dynamic/characters/grid", { token: owner.token, accept: "application/json", },);

      expect(res.status,).toBe(200,);
      expect(res.body,).toContain(SEED.character.id,);
    });

    test("a stranger's character search omits foreign characters", async () => {
      const res = await rawGet(`/dynamic/characters/search?q=${encodeURIComponent(SEED.character.name,)}`, {
        token: other.token,
        htmx: true,
      },);

      expect(res.status,).toBe(200,);
      expect(res.body,).not.toContain(SEED.character.id,);
      expect(res.body,).not.toContain(SEED.character.name,);
    });

    test("the owner's character search lists them (positive control)", async () => {
      const res = await rawGet(`/dynamic/characters/search?q=${encodeURIComponent(SEED.character.name,)}`, {
        token: owner.token,
        htmx: true,
      },);

      expect(res.status,).toBe(200,);
      expect(res.body,).toContain(SEED.character.id,);
    });

    test("a stranger's character chat-list is the empty state, not the owner's chat", async () => {
      // The `:id` path param of this route is a chat-name search substring,
      // not a character id (see serveCharacterChatListDb) — match on the name.
      const res = await rawGet(`/dynamic/characters/${encodeURIComponent(SEED.chat.name,)}/chat-list`, {
        token: other.token,
        htmx: true,
      },);

      expect(res.status,).toBe(200,);
      expect(res.body,).toContain("No chats yet",);
      expect(res.body,).not.toContain(`chat-item-${SEED.chat.id}`,);
      expect(res.body,).not.toContain(SEED.chat.name,);
    });

    test("anonymous htmx requests to all four surfaces are 401", async () => {
      const paths = [
        "/dynamic/characters/grid",
        "/dynamic/characters/search",
        `/dynamic/characters/${SEED.character.id}/edit-form`,
        `/dynamic/characters/${SEED.character.id}/chat-list`,
      ];

      for (const path of paths) {
        const res = await rawGet(path, { htmx: true, },);

        expect(res.status,).toBe(401,);
        expect(res.body,).not.toContain(SEED.character.id,);
      }
    });
  });
});

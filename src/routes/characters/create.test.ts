// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: WIRE-characters-create-avatar-linking-missing.
 * Ensures `createRoutes` calls `linkAsset` after actor insert when
 * `assetId` is provided in the request body.
 *
 * Requires `--isolate` so `mock.module` can rebind the asset link service
 * before `createRoutes` is loaded.
 */
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";

import * as realLinks from "../../assets/service/links";
import { createRoutes, } from "./create";

interface LinkAssetCall {
  database: unknown;
  assetId: string;
  link: { entityType: string; entityId: string; label: string | null };
}

const linkAssetCalls: LinkAssetCall[] = [];
mock.module("../../assets/service/links", () => {
  const linkAssetMock = async (opts: LinkAssetCall,) => {
    linkAssetCalls.push(opts,);
  };
  return {
    ...realLinks,
    linkAsset: linkAssetMock,
    unlinkAsset: async () => {},
    getAssetLinks: async () => [],
  };
},);

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId: string,): Elysia {
  const app = new Elysia({ name: "test-create", },);
  app.derive(() => ({ userId, userRole: "user", }));
  return app.use(createRoutes({ database: db, }, "/api",),) as unknown as Elysia;
}

describe("createRoutes avatar asset linking", () => {
  let testEnv: Awaited<ReturnType<typeof createTestDb>>;
  let app: Elysia;
  const USER = "00000000-0000-4000-8000-000000000001";
  const ASSET = "00000000-0000-4000-8000-000000000099";

  beforeEach(async () => {
    testEnv = await createTestDb();
    await insertUsers(testEnv.db, "tester", "Test User", { id: USER as never, },);
    linkAssetCalls.length = 0;
    app = makeApp(testEnv.db, USER,);
  },);

  afterEach(() => {
    testEnv.sqlite.close();
  },);

  test("links asset to actor when assetId is provided", async () => {
    const res = await app.handle(
      new Request("http://test/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          displayName: "TestChar",
          assetId: ASSET,
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    expect(linkAssetCalls,).toHaveLength(1,);
    expect(linkAssetCalls[0]?.assetId,).toBe(ASSET,);
    expect(linkAssetCalls[0]?.link.entityType,).toBe("actor",);
    expect(linkAssetCalls[0]?.link.entityId,).toBeDefined();
    expect(linkAssetCalls[0]?.link.label,).toBe("avatar",);
  });

  test("does NOT call linkAsset when assetId is omitted", async () => {
    const res = await app.handle(
      new Request("http://test/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "NoAvatar", },),
      },),
    );
    expect(res.status,).toBe(201,);
    expect(linkAssetCalls,).toHaveLength(0,);
  });

  test("persists personality/scenario/welcomeMessage/tags/agentRole (BUG-character-create-silently-drops)", async () => {
    const res = await app.handle(
      new Request("http://test/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          displayName: "DetailsChar",
          personality: "witty, loyal",
          scenario: "in a tavern",
          welcomeMessage: "Hello traveller!",
          tags: "fantasy, elf, mentor",
          agentRole: "guide",
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = (await res.json()) as { id: string };

    const row = await testEnv.db
      .selectFrom("actors",)
      .select([
        "personality",
        "scenario",
        "welcome_message",
        "settings",
        "agent_role",
      ],)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(row?.personality,).toBe("witty, loyal",);
    expect(row?.scenario,).toBe("in a tavern",);
    expect(row?.welcome_message,).toBe("Hello traveller!",);
    expect(row?.agent_role,).toBe("guide",);
    // tags are parsed into settings JSON {tags: [...]}
    const settings = JSON.parse(row?.settings ?? "{}",) as { tags?: string[] };
    expect(settings.tags,).toEqual(["fantasy", "elf", "mentor",],);
  });
});

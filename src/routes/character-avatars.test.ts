/**
 * Tests for character avatar routes — CRUD, selection, and config.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AvatarService, } from "../characters/services/avatar-service";
import { AssetLinkEntity, } from "../db/enums-content";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { characterAvatarsRoutes, } from "./character-avatars";

/** Minimal shape of the route table Elysia builds, for duplicate checks. */
interface RouteRow {
  method: string;
  path: string;
}

/** Flatten a plugin's registered routes to `METHOD path` keys. */
function routeKeys(app: unknown,): string[] {
  const { routes, } = app as { routes: RouteRow[] };
  return routes.map((r,) => `${r.method} ${r.path}`);
}

const OWNER = "00000000-0000-4000-8000-000000000001";
const OWNER_USER = "00000000-0000-4000-8000-000000000011";
const OTHER = "00000000-0000-4000-8000-000000000002";
const OTHER_USER = "00000000-0000-4000-8000-000000000012";
const ASSET = "00000000-0000-4000-8000-000000000101";
const ASSET2 = "00000000-0000-4000-8000-000000000102";
const ADMIN_ASSET = "00000000-0000-4000-8000-000000000103";
const WORLD = "00000000-0000-4000-8000-000000000201";
const WORLD2 = "00000000-0000-4000-8000-000000000202";

/**
 * @param db
 * @param userId
 * @param userRole
 * @param prefix
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string, prefix = "/api",) {
  return new Elysia({ name: "test-avatars", },)
    .derive(() => ({ userId, userRole, }))
    .use(characterAvatarsRoutes({ database: db, }, prefix,),) as unknown as Elysia;
}

describe("characterAvatarsRoutes", () => {
  test("exports function", () => {
    expect(typeof characterAvatarsRoutes,).toBe("function",);
  });
});

describe("Avatar CRUD — owner", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    await insertActors(db, "Other Actor", {
      id: OTHER as never,
      owner_id: OTHER_USER,
      user_id: OTHER_USER,
    },);

    await insertAssets(db, OWNER_USER, "avatar.png", "image/png", "image", 1024, "/assets/avatar.png", {
      id: ASSET as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET avatars returns 401 without auth", async () => {
    const app = makeApp(db,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET avatars returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(404,);
  });

  test("GET avatars returns empty array for actor with no avatars", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("POST avatar creates an avatar", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ASSET, mood: "happy", },),
      },),
    );

    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    expect(id,).toBeDefined();
  });

  test("POST avatar returns 400 when image_url is missing", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ mood: "happy", },),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("POST avatar returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ASSET, mood: "sad", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("DELETE avatar returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/${ASSET}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(404,);
  });
});

describe("Avatar CRUD — admin/solo bypass", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    await insertAssets(db, OWNER_USER, "avatar.png", "image/png", "image", 1024, "/assets/avatar.png", {
      id: ASSET as never,
    },);
    // The admin below acts as userId "admin"; it needs its OWN asset, since
    // the create route now gates the asset with the strict owner-only guard.
    await insertUsers(db, "admin-user", "Admin", { id: "admin" as never, },);
    await insertAssets(db, "admin", "admin.png", "image/png", "image", 1024, "/assets/admin.png", {
      id: ADMIN_ASSET as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("admin can GET another user's avatars", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(200,);
  });

  test("solo can GET another user's avatars", async () => {
    const app = makeApp(db, "solo", "solo",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(200,);
  });

  // The ACTOR bypass is unchanged and still exercised here: admin posts to
  // another user's actor. What changed is the ASSET - the create route now
  // runs requireAssetOwner, so admin uses an asset it actually owns. The
  // cross-user-asset refusal is pinned by the next test.
  test("admin can POST avatar on another user's actor", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ADMIN_ASSET, mood: "neutral", },),
      },),
    );

    expect(res.status,).toBe(201,);
  });

  // requireActorAccess grants admin/solo a bypass via can(role, "admin.character"),
  // but requireAssetOwner is strict owner-only - matching the unlink route and
  // DELETE /assets/:id/links/:linkId. An admin can no longer attach another
  // user's asset. Pinned here so it is explicit, not a silent side effect.
  test("admin is refused when the asset belongs to another user", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ASSET, mood: "neutral", },),
      },),
    );

    expect(res.status,).toBe(404,);
    const links = await db
      .selectFrom("asset_links",)
      .select(["entity_id",],)
      .where("asset_id", "=", ASSET,)
      .where("entity_id", "=", OWNER,)
      .execute();
    expect(links,).toHaveLength(0,);
  });
});

describe("Avatar config", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET avatar config returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/config`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("PUT avatar config creates config", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "mood_first", },),
      },),
    );

    expect(res.status,).toBe(201,);
  });

  test("PUT avatar config returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "random", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });
});

describe("Routes recovered from the shadowed character-avatars/ directory", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    await insertAssets(db, OWNER_USER, "a.png", "image/png", "image", 1024, "/a.png", {
      id: ASSET as never,
    },);

    await insertAssets(db, OWNER_USER, "b.png", "image/png", "image", 1024, "/b.png", {
      id: ASSET2 as never,
    },);

    await insertWorlds(db, OWNER_USER, "Test World", { id: WORLD as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("DELETE /actors/:actorId/assets/:assetId unlinks the asset link row", async () => {
    await insertAssetLinks(db, ASSET, AssetLinkEntity.Actor, OWNER,);
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/assets/${ASSET}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(204,);

    // The link row is gone, but the asset itself is preserved.
    const links = await db
      .selectFrom("asset_links",)
      .selectAll()
      .where("asset_id", "=", ASSET,)
      .where("entity_id", "=", OWNER,)
      .execute();

    expect(links.length,).toBe(0,);
    const asset = await db.selectFrom("assets",).selectAll().where("id", "=", ASSET,).executeTakeFirst();
    expect(asset,).toBeDefined();
  });

  test("DELETE asset link leaves other links on the same asset alone", async () => {
    await insertAssetLinks(db, ASSET2, AssetLinkEntity.Actor, OWNER,);
    await insertAssetLinks(db, ASSET2, AssetLinkEntity.World, WORLD,);
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/assets/${ASSET2}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(204,);

    const remaining = await db
      .selectFrom("asset_links",)
      .select("entity_type",)
      .where("asset_id", "=", ASSET2,)
      .execute();

    expect(remaining.map((r,) => r.entity_type),).toEqual([AssetLinkEntity.World,],);
  });

  test("DELETE asset returns 401 without auth", async () => {
    const app = makeApp(db,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/assets/${ASSET}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(401,);
  });

  test("DELETE asset returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/assets/${ASSET}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(404,);
  });

  test("GET single avatar returns the avatar", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const created = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ASSET, mood: "calm", },),
      },),
    );

    const { id, } = await created.json() as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars/${id}`,),);
    expect(res.status,).toBe(200,);
  });

  test("GET single avatar returns 404 for an unknown avatar id", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/00000000-0000-4000-8000-000000000999`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("PUT then GET world avatar config round-trips the override", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const put = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OWNER}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "mood_first", },),
      },),
    );

    expect(put.status,).toBe(200,);

    const get = await app.handle(new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OWNER}`,),);
    expect(get.status,).toBe(200,);
    const config = await get.json() as { selectionRuleOverride: string };
    expect(config.selectionRuleOverride,).toBe("mood_first",);
  });

  test("PUT world avatar config rejects an unknown selection rule and persists nothing", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OWNER}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "TOTALLY_BOGUS_RULE", },),
      },),
    );

    expect(res.status,).toBe(400,);

    const stored = await db
      .selectFrom("world_avatar_config",)
      .selectAll()
      .where("actor_id", "=", OWNER,)
      .execute();

    expect(stored.map((row,) => String(row.selection_rule_override ?? "",)),).not.toContain("TOTALLY_BOGUS_RULE",);
  });

  test("PUT world avatar config accepts an omitted rule", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OWNER}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );

    expect(res.status,).toBe(200,);
  });

  test("GET world avatar config returns 404 when unset", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OTHER}`,),);
    expect(res.status,).toBe(404,);
  });

  test("world avatar config returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OWNER}`,),);
    expect(res.status,).toBe(404,);
  });
});

describe("Prefix parameterisation", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    await insertAssets(db, OWNER_USER, "a.png", "image/png", "image", 1024, "/a.png", {
      id: ASSET as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("/api/v1 prefix mounts the recovered DELETE asset route", async () => {
    await insertAssetLinks(db, ASSET, AssetLinkEntity.Actor, OWNER,);
    const app = makeApp(db, OWNER_USER, "user", "/api/v1",);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/actors/${OWNER}/assets/${ASSET}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(204,);
  });

  test("/api/v1 prefix does not serve the unprefixed path", async () => {
    const app = makeApp(db, OWNER_USER, "user", "/api/v1",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(404,);
  });

  test("/api/v1 prefix mounts the original CRUD route", async () => {
    const app = makeApp(db, OWNER_USER, "user", "/api/v1",);
    const res = await app.handle(new Request(`http://localhost/api/v1/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(200,);
  });

  test("no route is registered twice under either prefix", () => {
    for (const prefix of ["/api", "/api/v1",]) {
      const keys = routeKeys(characterAvatarsRoutes({ database: db, }, prefix,),);
      expect(new Set(keys,).size,).toBe(keys.length,);
    }
  });
});

describe("Authorization — resource-level (IDOR)", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let avatarService: AvatarService;
  let victimAvatarId: string;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    avatarService = new AvatarService(db,);
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    // Actor owned by OTHER_USER, carrying a private avatar.
    await insertActors(db, "Other Actor", {
      id: OTHER as never,
      owner_id: OTHER_USER,
      user_id: OTHER_USER,
    },);

    await insertAssets(db, OTHER_USER, "v.png", "image/png", "image", 1024, "/v.png", {
      id: ASSET as never,
    },);

    await insertAssets(db, OWNER_USER, "m.png", "image/png", "image", 1024, "/m.png", {
      id: ASSET2 as never,
    },);

    await insertWorlds(db, OWNER_USER, "Owner World", { id: WORLD as never, },);
    await insertWorlds(db, OTHER_USER, "Other World", { id: WORLD2 as never, },);

    victimAvatarId = await avatarService.createAvatar({
      actorId: OTHER,
      assetId: ASSET,
      label: "private",
      tags: { emotion: "secret-emotion", },
      isPrimary: true,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("cannot read another actor's avatar through an actor it owns (IDOR)", async () => {
    // Caller owns OWNER but asks for an avatar that belongs to OTHER.
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/${victimAvatarId}`,),
    );

    expect(res.status,).toBe(404,);
    expect(await res.text(),).not.toContain("secret-emotion",);
  });

  test("can read an avatar belonging to an actor it owns", async () => {
    const own = await avatarService.createAvatar({
      actorId: OWNER,
      assetId: ASSET2,
      label: "mine",
      tags: { emotion: "happy", },
      isPrimary: false,
    },);

    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/${own}`,),
    );

    expect(res.status,).toBe(200,);
  });

  test("cannot write world config into a world it does not own", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD2}/avatars/config/${OWNER}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "mood_first", },),
      },),
    );

    expect(res.status,).toBe(403,);

    const rows = await db
      .selectFrom("world_avatar_config",)
      .selectAll()
      .where("world_id", "=", WORLD2,)
      .execute();

    expect(rows.length,).toBe(0,);
  });

  test("cannot read world config from a world it does not own", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD2}/avatars/config/${OWNER}`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("can read and write world config in a world it owns", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const put = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OWNER}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "action_first", },),
      },),
    );

    expect(put.status,).toBe(200,);
    const get = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD}/avatars/config/${OWNER}`,),
    );

    expect(get.status,).toBe(200,);
  });

  test("admin role is not denied by the world owner check", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD2}/avatars/config/${OTHER}`,),
    );

    expect(res.status,).not.toBe(403,);
  });
});

describe("Avatar select, update, delete", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let avatarService: AvatarService;
  let ownAvatarId: string;
  let foreignAvatarId: string;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    avatarService = new AvatarService(db,);
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    await insertActors(db, "Other Actor", {
      id: OTHER as never,
      owner_id: OTHER_USER,
      user_id: OTHER_USER,
    },);

    await insertAssets(db, OWNER_USER, "own.png", "image/png", "image", 1024, "/own.png", {
      id: ASSET as never,
    },);

    await insertAssets(db, OWNER_USER, "other.png", "image/png", "image", 1024, "/other.png", {
      id: ASSET2 as never,
    },);

    ownAvatarId = await avatarService.createAvatar({
      actorId: OWNER,
      assetId: ASSET,
      label: "own-avatar",
      tags: { emotion: "happy", },
      isPrimary: false,
    },);

    // Belongs to OTHER — selecting it through OWNER must be refused.
    foreignAvatarId = await avatarService.createAvatar({
      actorId: OTHER,
      assetId: ASSET2,
      label: "foreign-avatar",
      tags: { emotion: "secret-emotion", },
      isPrimary: false,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  const select = (actorId: string, avatarId: string, userId?: string,) =>
    makeApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/avatars/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ avatar_id: avatarId, },),
      },),
    );

  test("POST select returns 401 without auth", async () => {
    const res = await select(OWNER, ownAvatarId,);
    expect(res.status,).toBe(401,);
  });

  test("POST select returns 404 for another user's actor", async () => {
    const res = await select(OWNER, ownAvatarId, OTHER_USER,);
    expect(res.status,).toBe(404,);
  });

  test("POST select refuses an avatar owned by a different actor (IDOR)", async () => {
    const res = await select(OWNER, foreignAvatarId, OWNER_USER,);
    expect(res.status,).toBe(404,);
    expect(await res.text(),).not.toContain("secret-emotion",);
  });

  test("POST select returns 404 for an unknown avatar id", async () => {
    const res = await select(OWNER, "00000000-0000-4000-8000-00000000dead", OWNER_USER,);
    expect(res.status,).toBe(404,);
  });

  test("POST select returns the avatar when the actor owns it", async () => {
    const res = await select(OWNER, ownAvatarId, OWNER_USER,);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string; actorId: string };
    expect(body.id,).toBe(ownAvatarId,);
    expect(body.actorId,).toBe(OWNER,);
  });

  test("PUT avatar updates the emotion tag", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/${ownAvatarId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ emotion: "calm", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const updated = await avatarService.getAvatar(ownAvatarId,);
    expect(updated?.label,).toBe("calm",);
    expect(updated?.tags.emotion,).toBe("calm",);
  });

  test("PUT avatar falls back to mood when no emotion is given", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/${ownAvatarId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ mood: "stoic", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const updated = await avatarService.getAvatar(ownAvatarId,);
    expect(updated?.label,).toBe("stoic",);
    expect(updated?.tags.mood,).toBe("stoic",);
  });

  test("DELETE avatar removes it", async () => {
    const doomed = await avatarService.createAvatar({
      actorId: OWNER,
      assetId: ASSET,
      label: "doomed",
      tags: { emotion: "meh", },
      isPrimary: false,
    },);

    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/${doomed}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(204,);
    expect(await avatarService.getAvatar(doomed,),).toBeUndefined();
  });
});

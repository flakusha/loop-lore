// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for asset tagging (gallery tagging G7): authentication, scope
 * ownership, global curation gating, propositions + dismissal, and autocomplete.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AssetType, AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { assetTagRoutes, } from "./index";

const BASE = "http://localhost";

let db: Kysely<DB>;
let sqlite: Database;
let ownerId: string;
let adminId: string;
let viewerId: string;
let assetId: string;

function tagsApp(): Elysia {
  return new Elysia({ name: "test-asset-tags", },)
    .derive(() => ({ userId: null as string | null, userRole: null as string | null, }))
    .use(assetTagRoutes({ database: db, },),) as unknown as Elysia;
}

function appAs(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-asset-tags-auth", },)
    .derive(() => ({ userId, userRole, }))
    .use(assetTagRoutes({ database: db, },),) as unknown as Elysia;
}

function handle(app: Elysia, path: string, init: RequestInit = {},): Promise<Response> {
  const request = new Request(`${BASE}${path}`, init,);
  return (app as unknown as { handle: (r: Request,) => Promise<Response> }).handle(request,);
}

function json(method: string, body: unknown,): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  };
}

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  ownerId = uid();
  adminId = uid();
  viewerId = uid();
  assetId = uid();
  await insertUsers(db, "tag-owner", "Owner", { id: ownerId, } as never,);
  await insertUsers(db, "tag-admin", "Admin", { id: adminId, role: "admin" as never, } as never,);
  await insertUsers(db, "tag-viewer", "Viewer", { id: viewerId, } as never,);
  await insertAssets(db, ownerId, "cozy tavern.png", "image/png", AssetType.Image, 1024, "/t.png", {
    id: assetId,
    visibility: AssetVisibility.Public,
    alt_text: "a cozy tavern hall",
  },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

beforeEach(async () => {
  await db.deleteFrom("asset_tags",).execute();
  await db.deleteFrom("asset_tag_dismissals",).execute();
},);

interface AssetTagRecord {
  id: string;
  tag: string;
  scope: string;
  source: string;
}

describe("GET /api/assets/:id/tags", () => {
  test("unauthenticated → 401", async () => {
    const res = await handle(appAs(null, null,), `/api/assets/${assetId}/tags`,);
    expect(res.status,).toBe(401,);
  });

  test("returns global + own user tags, sorted; strangers see only global", async () => {
    await handle(
      appAs(ownerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "shared", scope: "global", },),
    );
    await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "mine", scope: "user", },),
    );

    const ownerRes = await handle(appAs(ownerId, "user",), `/api/assets/${assetId}/tags`,);
    const ownerBody = (await ownerRes.json()) as { tags: AssetTagRecord[] };
    expect(ownerBody.tags.map((t,) => t.tag),).toEqual(["shared",],);

    const viewerRes = await handle(appAs(viewerId, "user",), `/api/assets/${assetId}/tags`,);
    const viewerBody = (await viewerRes.json()) as { tags: AssetTagRecord[] };
    expect(viewerBody.tags.map((t,) => t.tag),).toEqual(["mine", "shared",],);
  });

  test("missing asset → 404", async () => {
    const res = await handle(appAs(viewerId, "user",), `/api/assets/${uid()}/tags`,);
    expect(res.status,).toBe(404,);
  });
});

describe("POST /api/assets/:id/tags (add)", () => {
  test("user adds their own user tag", async () => {
    const res = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "mine", scope: "user", },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { tag: AssetTagRecord };
    expect(body.tag.tag,).toBe("mine",);
    expect(body.tag.scope,).toBe("user",);
  });

  test("stranger cannot add global; asset owner can", async () => {
    const denied = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "shared", scope: "global", },),
    );
    expect(denied.status,).toBe(403,);

    const allowed = await handle(
      appAs(ownerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "shared", scope: "global", },),
    );
    expect(allowed.status,).toBe(200,);
  });

  test("admin can curate global on another's asset", async () => {
    const res = await handle(
      appAs(adminId, "admin",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "shared", scope: "global", },),
    );
    expect(res.status,).toBe(200,);
  });
});

describe("DELETE /api/assets/:id/tags (remove)", () => {
  test("user removes their own tag only", async () => {
    await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "mine", scope: "user", },),
    );
    const res = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("DELETE", { tag: "mine", scope: "user", },),
    );
    expect(res.status,).toBe(204,);

    const list = (await (await handle(appAs(viewerId, "user",), `/api/assets/${assetId}/tags`,)).json()) as {
      tags: AssetTagRecord[];
    };
    expect(list.tags,).toEqual([],);
  });

  test("stranger cannot remove global", async () => {
    await handle(
      appAs(ownerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "shared", scope: "global", },),
    );
    const res = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("DELETE", { tag: "shared", scope: "global", },),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("POST /api/assets/:id/tags/rename", () => {
  test("renames own user tag; rejects identical pair", async () => {
    await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "old", scope: "user", },),
    );
    const res = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags/rename`,
      json("POST", { oldTag: "old", newTag: "new", scope: "user", },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { tag: AssetTagRecord };
    expect(body.tag.tag,).toBe("new",);

    const bad = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags/rename`,
      json("POST", { oldTag: "new", newTag: "new", scope: "user", },),
    );
    expect(bad.status,).toBe(400,);
  });
});

describe("GET + DELETE /api/assets/:id/tag-propositions", () => {
  test("proposes metadata tokens; dismiss stops re-proposal", async () => {
    const before =
      (await (await handle(appAs(viewerId, "user",), `/api/assets/${assetId}/tag-propositions`,)).json()) as {
        propositions: { tag: string; provenance: string }[];
      };
    expect(before.propositions.map((p,) => p.tag),).toEqual(["cozy", "tavern", "hall",],);

    const dismiss = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tag-propositions`,
      json("DELETE", { tag: "cozy", },),
    );
    expect(dismiss.status,).toBe(204,);

    const after =
      (await (await handle(appAs(viewerId, "user",), `/api/assets/${assetId}/tag-propositions`,)).json()) as {
        propositions: { tag: string }[];
      };
    expect(after.propositions.map((p,) => p.tag),).toEqual(["tavern", "hall",],);
  });
});

describe("GET /api/tag-autocomplete", () => {
  test("returns distinct visible vocabulary, prefix-narrowed", async () => {
    await handle(
      appAs(ownerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "tavern", scope: "global", },),
    );
    await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "cellar", scope: "user", },),
    );

    const all = (await (await handle(appAs(viewerId, "user",), `/api/tag-autocomplete`,)).json()) as { tags: string[] };
    expect(all.tags,).toEqual(["cellar", "tavern",],);

    const narrow = (await (await handle(appAs(viewerId, "user",), `/api/tag-autocomplete?q=t`,)).json()) as {
      tags: string[];
    };
    expect(narrow.tags,).toEqual(["tavern",],);
  });
});

describe("private-asset access (add/remove/rename)", () => {
  test("inaccessible asset → 404 for add, remove, and rename; no rows land", async () => {
    const privateId = uid();
    await insertAssets(db, ownerId, "secret.png", "image/png", AssetType.Image, 1024, "/secret.png", {
      id: privateId,
      visibility: AssetVisibility.Private,
      alt_text: null,
    },);

    const add = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${privateId}/tags`,
      json("POST", { tag: "sneak", scope: "user", },),
    );
    expect(add.status,).toBe(404,);

    const remove = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${privateId}/tags`,
      json("DELETE", { tag: "sneak", scope: "user", },),
    );
    expect(remove.status,).toBe(404,);

    const rename = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${privateId}/tags/rename`,
      json("POST", { oldTag: "sneak", newTag: "quiet", scope: "user", },),
    );
    expect(rename.status,).toBe(404,);

    const rows = await db.selectFrom("asset_tags",).select("id",).where("asset_id", "=", privateId,).execute();
    expect(rows,).toEqual([],);
  });
});

describe("tag integrity (empty tags)", () => {
  test("whitespace-only tag → 422 (schema), no row", async () => {
    const res = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "   ", scope: "user", },),
    );
    expect(res.status,).toBe(422,);

    const list = (await (await handle(appAs(viewerId, "user",), `/api/assets/${assetId}/tags`,)).json()) as {
      tags: AssetTagRecord[];
    };
    expect(list.tags,).toEqual([],);
  });

  test("rename to whitespace-only newTag → 422", async () => {
    await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags`,
      json("POST", { tag: "old", scope: "user", },),
    );
    const res = await handle(
      appAs(viewerId, "user",),
      `/api/assets/${assetId}/tags/rename`,
      json("POST", { oldTag: "old", newTag: "  ", scope: "user", },),
    );
    expect(res.status,).toBe(422,);
  });
});

describe("no-auth app", () => {
  test("autocomplete without a userId → 401", async () => {
    const res = await handle(tagsApp(), `/api/tag-autocomplete`,);
    expect(res.status,).toBe(401,);
  });
});

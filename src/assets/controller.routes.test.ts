// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the asset controller surface: collection, single-asset,
 * serve variants, signed URLs, links, shares, and upload.
 *
 * Pins the ownership trust boundary on every route (401 anonymous, 404
 * outsider) plus the happy paths, so the diff-scoped coverage gate measures
 * the whole controller file — not just the transform routes.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { assetRoutes, handleUpload, } from "./controller";
import { createAsset, } from "./service";
import { makeMinimalPng, } from "./test-helpers";

interface Fixture {
  db: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  outsiderId: string;
  assetId: string;
}

function makeApp(db: Kysely<DB>, userId: string | null, uploadDir: string, mutate?: (c: Config,) => void,) {
  const config = createConfigSchema().defaults as Config;
  config.assets.uploadDir = uploadDir;
  mutate?.(config,);
  return new Elysia()
    .derive(() => ({ userId, userRole: "user", }))
    .use(assetRoutes({ database: db, config, },),);
}

function jsonRequest(url: string, method: string, body: unknown,) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/** Build a File from generated PNG bytes on a real ArrayBuffer (strict BlobPart). */
function pngFile(name: string, width: number, height: number,) {
  const src = makeMinimalPng(width, height,);
  const bytes = new Uint8Array(src.length,);
  bytes.set(src,);
  return new File([bytes.buffer,], name, { type: "image/png", },);
}

async function seed(): Promise<Fixture> {
  const { db, } = await createTestDb();
  const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-controller-test-",),);
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `out-${outsiderId}`, "Outsider", { id: outsiderId, } as never,);
  // asset_shares FKs point at actors.id — mirror each user as an actor.
  await db.insertInto("actors",).values({ id: ownerId, display_name: "Owner Actor", },).execute();
  await db.insertInto("actors",).values({ id: outsiderId, display_name: "Outsider Actor", },).execute();
  const buffer = makeMinimalPng(4, 3,);
  const { asset, } = await createAsset({
    database: db,
    input: {
      ownerId,
      filename: "sprite.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    },
    uploadDir,
  },);
  return { db, uploadDir, ownerId, outsiderId, assetId: asset.id, };
}

async function cleanup(fx: Fixture,) {
  await fx.db.destroy();
  rmSync(fx.uploadDir, { recursive: true, force: true, },);
}

describe("GET /api/assets", () => {
  test("owner lists their assets paginated", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request("http://localhost/api/assets?page=1&pageSize=10",),
      );
      expect(res.status,).toBe(200,);
      const json = (await res.json()) as { data: { id: string }[]; pagination: { total: number } };
      expect(json.pagination.total,).toBe(1,);
      expect(json.data.map((a,) => a.id),).toContain(fx.assetId,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 when the asset system is disabled", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir, (c,) => {
        c.assets.enabled = false;
      },).handle(new Request("http://localhost/api/assets",),);
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("GET /api/assets/:id", () => {
  test("owner reads metadata", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}`,),
      );
      expect(res.status,).toBe(200,);
      const json = (await res.json()) as { id: string };
      expect(json.id,).toBe(fx.assetId,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 for outsider on a private asset", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}`,),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("PATCH /api/assets/:id", () => {
  test("401 when unauthenticated", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, null, fx.uploadDir,).handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}`, "PATCH", { visibility: "shared", },),
      );
      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("400 on invalid visibility", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}`, "PATCH", { visibility: "bogus", },),
      );
      expect(res.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 for non-owner", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}`, "PATCH", { visibility: "shared", },),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("owner changes visibility", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}`, "PATCH", { visibility: "shared", },),
      );
      expect(res.status,).toBe(200,);
      const json = (await res.json()) as { id: string; visibility: string };
      expect(json.id,).toBe(fx.assetId,);
      expect(json.visibility,).toBe("shared",);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("DELETE /api/assets/:id", () => {
  test("401 when unauthenticated", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, null, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}`, { method: "DELETE", },),
      );
      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("owner deletes; second delete 404s", async () => {
    const fx = await seed();
    try {
      const app = makeApp(fx.db, fx.ownerId, fx.uploadDir,);
      const first = await app.handle(new Request(`http://localhost/api/assets/${fx.assetId}`, { method: "DELETE", },),);
      expect(first.status,).toBe(204,);
      const second = await app.handle(
        new Request(`http://localhost/api/assets/${fx.assetId}`, { method: "DELETE", },),
      );
      expect(second.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("serve routes", () => {
  test("raw serves the stored bytes to the owner", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/raw`,),
      );
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Content-Type",),).toBe("image/png",);
      expect((await res.arrayBuffer()).byteLength,).toBeGreaterThan(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("raw 404s for outsider on a private asset", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/raw`,),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("download serves an attachment", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/download`,),
      );
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Content-Disposition",),).toMatch(/attachment/,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("thumb falls back to raw without a variant file", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/thumb`,),
      );
      expect(res.status,).toBe(200,);
      expect((await res.arrayBuffer()).byteLength,).toBeGreaterThan(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("compressed falls back to raw without a variant file", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/compressed`,),
      );
      expect(res.status,).toBe(200,);
      expect((await res.arrayBuffer()).byteLength,).toBeGreaterThan(0,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("POST /api/assets/:id/signed-url/:action", () => {
  test("400 on an invalid action", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/signed-url/bogus`, { method: "POST", },),
      );
      expect(res.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("403 when signed URLs are not configured", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/signed-url/raw`, { method: "POST", },),
      );
      expect(res.status,).toBe(403,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("mints a tokened URL with a configured secret", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir, (c,) => {
        c.assets.signedUrlSecret = "test-hmac-secret-0123456789";
      },).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/signed-url/raw`, { method: "POST", },),
      );
      expect(res.status,).toBe(200,);
      const json = (await res.json()) as { url: string; token: string; action: string };
      expect(json.action,).toBe("raw",);
      expect(json.token.length,).toBeGreaterThan(0,);
      expect(json.url,).toContain(`sig=${json.token}`,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("asset links", () => {
  test("401 when unauthenticated", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, null, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links`,),
      );
      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("link round-trips through list and unlink", async () => {
    const fx = await seed();
    try {
      const app = makeApp(fx.db, fx.ownerId, fx.uploadDir,);
      const linked = await app.handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/links`, "POST", {
          entityType: "character",
          entityId: "char-1",
          label: "avatar",
        },),
      );
      expect(linked.status,).toBe(201,);
      const listed = await app.handle(new Request(`http://localhost/api/assets/${fx.assetId}/links`,),);
      expect(listed.status,).toBe(200,);
      const links = (await listed.json()) as { entity_id: string }[];
      expect(links.map((l,) => l.entity_id),).toContain("char-1",);
      const unlinked = await app.handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links/char-1`, { method: "DELETE", },),
      );
      expect(unlinked.status,).toBe(204,);
      const relisted = await app.handle(new Request(`http://localhost/api/assets/${fx.assetId}/links`,),);
      expect(((await relisted.json()) as unknown[]).length,).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("DELETE removes only the link addressed by the path id", async () => {
    const fx = await seed();
    try {
      const app = makeApp(fx.db, fx.ownerId, fx.uploadDir,);
      for (const entityId of ["char-1", "world-2",]) {
        const linked = await app.handle(
          jsonRequest(`http://localhost/api/assets/${fx.assetId}/links`, "POST", {
            entityType: "character",
            entityId,
          },),
        );
        expect(linked.status,).toBe(201,);
      }

      const deleted = await app.handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links/char-1`, { method: "DELETE", },),
      );
      expect(deleted.status,).toBe(204,);

      const listed = await app.handle(new Request(`http://localhost/api/assets/${fx.assetId}/links`,),);
      const links = (await listed.json()) as { entity_id: string }[];
      expect(links.map((l,) => l.entity_id),).toEqual(["world-2",],);

      // The deleted link 404s on repeat — never a silent success.
      const repeat = await app.handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links/char-1`, { method: "DELETE", },),
      );
      expect(repeat.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("DELETE 404s for an unknown link id", async () => {
    const fx = await seed();
    try {
      const app = makeApp(fx.db, fx.ownerId, fx.uploadDir,);
      const res = await app.handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links/ghost`, { method: "DELETE", },),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("DELETE 404s when a non-owner unlinks", async () => {
    const fx = await seed();
    try {
      const ownerApp = makeApp(fx.db, fx.ownerId, fx.uploadDir,);
      await ownerApp.handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/links`, "POST", {
          entityType: "character",
          entityId: "char-1",
        },),
      );

      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links/char-1`, { method: "DELETE", },),
      );
      expect(res.status,).toBe(404,);

      // Ownership is enforced server-side: the link survives the rejected call.
      const listed = await ownerApp.handle(new Request(`http://localhost/api/assets/${fx.assetId}/links`,),);
      expect(((await listed.json()) as unknown[]).length,).toBe(1,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 when a non-owner links", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/links`, "POST", {
          entityType: "character",
          entityId: "char-1",
        },),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("asset shares", () => {
  test("400 without actor_id", async () => {
    const fx = await seed();
    try {
      const app = makeApp(fx.db, fx.ownerId, fx.uploadDir,);
      const shareRes = await app.handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/share`, "POST", {},),
      );
      expect(shareRes.status,).toBe(400,);
      const unshareRes = await app.handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/share`, "DELETE", {},),
      );
      expect(unshareRes.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 when a non-owner shares", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/share`, "POST", { actor_id: fx.ownerId, },),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("share round-trips through list and unshare", async () => {
    const fx = await seed();
    try {
      const app = makeApp(fx.db, fx.ownerId, fx.uploadDir,);
      const shared = await app.handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/share`, "POST", { actor_id: fx.outsiderId, },),
      );
      expect(shared.status,).toBe(201,);
      const listed = await app.handle(new Request(`http://localhost/api/assets/${fx.assetId}/shares`,),);
      expect(listed.status,).toBe(200,);
      const shares = (await listed.json()) as { shared_with_id: string }[];
      expect(shares.map((s,) => s.shared_with_id),).toContain(fx.outsiderId,);
      const unshared = await app.handle(
        jsonRequest(`http://localhost/api/assets/${fx.assetId}/share`, "DELETE", { actor_id: fx.outsiderId, },),
      );
      expect(unshared.status,).toBe(204,);
      const relisted = await app.handle(new Request(`http://localhost/api/assets/${fx.assetId}/shares`,),);
      expect(((await relisted.json()) as unknown[]).length,).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("handleUpload", () => {
  test("400 without multipart content", async () => {
    const fx = await seed();
    try {
      const config = createConfigSchema().defaults as Config;
      const res = await handleUpload({
        request: new Request("http://localhost/api/assets", {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: "{}",
        },),
        userId: fx.ownerId,
        database: fx.db,
        uploadDir: fx.uploadDir,
        maxFileSize: config.assets.maxFileSize,
      },);
      expect(res.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("400 without a file field", async () => {
    const fx = await seed();
    try {
      const config = createConfigSchema().defaults as Config;
      const res = await handleUpload({
        request: new Request("http://localhost/api/assets", { method: "POST", body: new FormData(), },),
        userId: fx.ownerId,
        database: fx.db,
        uploadDir: fx.uploadDir,
        maxFileSize: config.assets.maxFileSize,
      },);
      expect(res.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("400 when the file exceeds max size", async () => {
    const fx = await seed();
    try {
      const form = new FormData();
      form.append("file", pngFile("big.png", 4, 3,),);
      const res = await handleUpload({
        request: new Request("http://localhost/api/assets", { method: "POST", body: form, },),
        userId: fx.ownerId,
        database: fx.db,
        uploadDir: fx.uploadDir,
        maxFileSize: 1,
      },);
      expect(res.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("400 on a rejected mime type", async () => {
    const fx = await seed();
    try {
      const config = createConfigSchema().defaults as Config;
      const form = new FormData();
      form.append("file", new File(["<svg></svg>",], "note.svg", { type: "image/svg+xml", },),);
      const res = await handleUpload({
        request: new Request("http://localhost/api/assets", { method: "POST", body: form, },),
        userId: fx.ownerId,
        database: fx.db,
        uploadDir: fx.uploadDir,
        maxFileSize: config.assets.maxFileSize,
      },);
      expect(res.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("stores a png and flags the duplicate resubmit", async () => {
    const fx = await seed();
    try {
      const config = createConfigSchema().defaults as Config;
      const png = pngFile("scene.png", 8, 6,);
      const firstForm = new FormData();
      firstForm.append("file", png,);
      const first = await handleUpload({
        request: new Request("http://localhost/api/assets", { method: "POST", body: firstForm, },),
        userId: fx.ownerId,
        database: fx.db,
        uploadDir: fx.uploadDir,
        maxFileSize: config.assets.maxFileSize,
      },);
      expect(first.status,).toBe(201,);
      const firstJson = (await first.json()) as { id: string };
      expect(firstJson.id,).toBeTruthy();
      const secondForm = new FormData();
      secondForm.append("file", png,);
      const second = await handleUpload({
        request: new Request("http://localhost/api/assets", { method: "POST", body: secondForm, },),
        userId: fx.ownerId,
        database: fx.db,
        uploadDir: fx.uploadDir,
        maxFileSize: config.assets.maxFileSize,
      },);
      expect(second.status,).toBe(200,);
      const secondJson = (await second.json()) as { id: string; duplicate: boolean };
      expect(secondJson.duplicate,).toBe(true,);
      expect(secondJson.id,).toBe(firstJson.id,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("PUT /api/assets/:id/transform (owner gate)", () => {
  test("404 for a missing asset", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        jsonRequest(`http://localhost/api/assets/${randomUUID()}/transform`, "PUT", { focalPointX: 0.4, },),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

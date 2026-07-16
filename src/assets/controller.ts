/**
 * Asset Controller
 *
 * Route handlers for asset CRUD operations.
 * Delegates to asset service for business logic.
 *
 *   GET    /api/assets              — list assets (paginated, filterable)
 *   POST   /api/assets              — upload new asset (multipart)
 *   GET    /api/assets/:id          — get asset metadata
 *   GET    /api/assets/:id/raw      — serve original file
 *   GET    /api/assets/:id/download — download file (attachment)
 *   GET    /api/assets/:id/thumb    — serve thumbnail
 *   GET    /api/assets/:id/compressed — serve compressed variant
 *   DELETE /api/assets/:id          — delete asset
 *   POST   /api/assets/:id/links    — link to entity
 *   DELETE /api/assets/:id/links/:linkId — unlink from entity
 */

import { readFileSync, existsSync } from "node:fs";
import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { AssetLinkEntity, AssetVisibility } from "../db/enums";
import { ErrorCode } from "../routes/http-utils";
import {
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
} from "../routes/http-utils";
import {
  createAsset,
  listAssets,
  getAsset,
  getAssetFilePath,
  deleteAsset,
  linkAsset,
  unlinkAsset,
  getAssetLinks,
  updateAssetVisibility,
  shareAsset,
  unshareAsset,
  getAssetShares,
  canAccessAsset,
  detectAssetType,
  validateFileSize,
  validateMimeType,
} from "./service";
import type { Config } from "../config/schema";

interface UploadOpts {
  request: Request;
  userId: string;
  database: Kysely<DB>;
  uploadDir: string;
  maxFileSize: number;
}
interface ServeRawOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  actorId: string | null;
  actorRole: string | null;
}
interface ServeCompressedOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  variant: string;
  actorId: string | null;
  actorRole: string | null;
}

export function assetRoutes({ database, config }: { database: Kysely<DB>; config: Config }) {
  return (
    new Elysia({ name: "assets" })
      .guard({
        beforeHandle: () => {
          if (!config.assets.enabled) {
            return jsonError({
              message: "Asset system is disabled",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            });
          }
        },
      })
      // ── Collection routes ─────────────────────────────
      .get("/api/assets", async (ctx) => {
        const searchParams = new URL(ctx.request.url).searchParams;
        const page = Number(searchParams.get("page") ?? "1");
        const pageSize = Math.min(Number(searchParams.get("pageSize") ?? "50"), 200);
        const entityType = searchParams.get("entity_type") ?? undefined;
        const entityId = searchParams.get("entity_id") ?? undefined;
        const label = searchParams.get("label") ?? undefined;

        const result = await listAssets(database, {
          page,
          pageSize,
          entityType: entityType as AssetLinkEntity,
          entityId,
          label,
        });
        return jsonPaginated({ data: result.data, total: result.total, page, pageSize });
      })
      .post("/api/assets", async (ctx) => {
        const userId = (ctx as any).userId as string | null;
        if (!userId)
          return jsonError({
            message: "Unauthorized",
            status: HttpStatus.Unauthorized,
            code: ErrorCode.Unauthorized,
          });
        return handleUpload({
          request: ctx.request,
          userId,
          database,
          uploadDir: config.assets.uploadDir,
          maxFileSize: config.assets.maxFileSize,
        });
      })
      // ── Single asset routes ──────────────────────────
      .get("/api/assets/:id", async (ctx) => {
        const asset = await getAsset(database, ctx.params.id);
        if (!asset)
          return jsonError({
            message: "Asset not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          });
        return jsonResponse(asset);
      })
      .patch("/api/assets/:id", async (ctx) => {
        const userId = (ctx as any).userId as string | null;
        if (!userId)
          return jsonError({
            message: "Unauthorized",
            status: HttpStatus.Unauthorized,
            code: ErrorCode.Unauthorized,
          });

        const body = (await ctx.request.json()) as { visibility?: string };
        if (
          !body.visibility ||
          ![AssetVisibility.Private, AssetVisibility.Shared, AssetVisibility.Public].includes(
            body.visibility as AssetVisibility,
          )
        ) {
          return jsonError({
            message: "Invalid visibility. Must be private, shared, or public",
            status: HttpStatus.BadRequest,
          });
        }

        const updated = await updateAssetVisibility({
          database,
          assetId: ctx.params.id,
          visibility: body.visibility as AssetVisibility,
          actorId: userId,
        });
        if (!updated)
          return jsonError({
            message: "Asset not found or not owner",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          });
        return jsonResponse({ id: updated.id, visibility: updated.visibility });
      })
      .delete("/api/assets/:id", async (ctx) => {
        const deleted = await deleteAsset({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
        });
        if (!deleted)
          return jsonError({
            message: "Asset not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          });
        return jsonNoContent();
      })
      // ── File serving routes ──────────────────────────
      .get("/api/assets/:id/raw", async (ctx) => {
        return handleServeRaw({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        });
      })
      .get("/api/assets/:id/download", async (ctx) => {
        return handleDownload({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        });
      })
      .get("/api/assets/:id/thumb", async (ctx) => {
        return handleServeCompressed({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          variant: "thumb",
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        });
      })
      .get("/api/assets/:id/compressed", async (ctx) => {
        return handleServeCompressed({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          variant: "compressed",
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        });
      })
      // ── Links sub-routes ─────────────────────────────
      .get("/api/assets/:id/links", async (ctx) => {
        const links = await getAssetLinks(database, ctx.params.id);
        return jsonResponse(links);
      })
      .post("/api/assets/:id/links", async (ctx) => {
        const body = await ctx.request.json();
        await linkAsset({
          database,
          assetId: ctx.params.id,
          link: body as { entityType: AssetLinkEntity; entityId: string; label?: string },
        });
        return jsonCreated({ id: ctx.params.id });
      })
      .delete("/api/assets/:id/links/:linkId", async (ctx) => {
        const body = (await ctx.request.json()) as { entityType?: string; entityId?: string };
        await unlinkAsset({
          database,
          assetId: ctx.params.id,
          entityType: (body.entityType ?? "") as AssetLinkEntity,
          entityId: body.entityId ?? "",
        });
        return jsonNoContent();
      })
      // ── Share sub-routes ─────────────────────────────
      .post("/api/assets/:id/share", async (ctx) => {
        const userId = (ctx as any).userId as string | null;
        if (!userId)
          return jsonError({
            message: "Unauthorized",
            status: HttpStatus.Unauthorized,
            code: ErrorCode.Unauthorized,
          });

        const body = (await ctx.request.json()) as { actor_id?: string };
        if (!body.actor_id)
          return jsonError({ message: "actor_id is required", status: HttpStatus.BadRequest });

        const share = await shareAsset({
          database,
          assetId: ctx.params.id,
          sharedWithId: body.actor_id,
          sharedById: userId,
        });
        if (!share)
          return jsonError({
            message: "Asset not found or not owner",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          });
        return jsonCreated(share);
      })
      .delete("/api/assets/:id/share", async (ctx) => {
        const body = (await ctx.request.json()) as { actor_id?: string };
        if (!body.actor_id)
          return jsonError({ message: "actor_id is required", status: HttpStatus.BadRequest });

        await unshareAsset({ database, assetId: ctx.params.id, sharedWithId: body.actor_id });
        return jsonNoContent();
      })
      .get("/api/assets/:id/shares", async (ctx) => {
        const shares = await getAssetShares(database, ctx.params.id);
        return jsonResponse(shares);
      })
  );
}

async function handleUpload({
  request,
  userId,
  database,
  uploadDir,
  maxFileSize,
}: UploadOpts): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return jsonError({ message: "Expected multipart/form-data", status: HttpStatus.BadRequest });
  }

  let formData;
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    formData = await request.formData();
  } catch {
    return jsonError({ message: "Failed to parse multipart form data", status: HttpStatus.BadRequest });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return jsonError({ message: "file field is required", status: HttpStatus.BadRequest });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sizeError = validateFileSize(buffer.length, maxFileSize);
  if (sizeError) return jsonError({ message: sizeError, status: HttpStatus.BadRequest });

  const mimeType = file.type || "application/octet-stream";
  const mimeError = validateMimeType(mimeType);
  if (mimeError) return jsonError({ message: mimeError, status: HttpStatus.BadRequest });

  const altText = (formData.get("alt_text") as string) ?? undefined;

  const asset = await createAsset({
    database,
    input: {
      ownerId: userId,
      filename: file.name,
      mimeType,
      assetType: detectAssetType(mimeType),
      sizeBytes: buffer.length,
      buffer,
      altText,
    },
    uploadDir,
  });

  return jsonCreated({
    id: asset.id,
    filename: asset.filename,
    mime_type: asset.mime_type,
    asset_type: asset.asset_type,
    size_bytes: asset.size_bytes,
    storage_backend: asset.storage_backend,
    alt_text: asset.alt_text,
  });
}

async function handleServeRaw({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
}: ServeRawOpts): Promise<Response> {
  const allowed = await canAccessAsset(database, assetId, actorId, actorRole);
  if (!allowed)
    return jsonError({ message: "Not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const asset = await getAsset(database, assetId);
  if (!asset)
    return jsonError({ message: "Asset not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const filePath = getAssetFilePath(uploadDir, asset.storage_path);
  if (!existsSync(filePath))
    return jsonError({ message: "File not found on disk", status: HttpStatus.NotFound });

  const data = readFileSync(filePath);
  return new Response(data, {
    headers: {
      "Content-Type": asset.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

async function handleServeCompressed({
  database,
  assetId,
  uploadDir,
  variant,
  actorId,
  actorRole,
}: ServeCompressedOpts): Promise<Response> {
  const allowed = await canAccessAsset(database, assetId, actorId, actorRole);
  if (!allowed)
    return jsonError({ message: "Not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const asset = await getAsset(database, assetId);
  if (!asset)
    return jsonError({ message: "Asset not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const compressedFilename = `${assetId}_${variant}.webp`;

  // Construct compressed path: same subdir as raw, "compressed/" prefix
  const subDir = `${assetId.slice(0, 2)}/${assetId.slice(2, 4)}`;
  const compressedPath = `compressed/${subDir}/${compressedFilename}`;
  const fullPath = getAssetFilePath(uploadDir, compressedPath);

  if (!existsSync(fullPath)) {
    // Fall back to raw if no compressed variant
    return handleServeRaw({ database, assetId, uploadDir, actorId, actorRole });
  }

  const data = readFileSync(fullPath);
  return new Response(data, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

async function handleDownload({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
}: ServeRawOpts): Promise<Response> {
  const allowed = await canAccessAsset(database, assetId, actorId, actorRole);
  if (!allowed)
    return jsonError({ message: "Not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const asset = await getAsset(database, assetId);
  if (!asset)
    return jsonError({ message: "Asset not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const filePath = getAssetFilePath(uploadDir, asset.storage_path);
  if (!existsSync(filePath))
    return jsonError({ message: "File not found on disk", status: HttpStatus.NotFound });

  const data = readFileSync(filePath);
  const safeName = asset.filename.replaceAll(/[^\w.-]+/g, "_");
  return new Response(data, {
    headers: {
      "Content-Type": asset.mime_type,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

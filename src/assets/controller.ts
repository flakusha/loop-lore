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
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import { ErrorCode } from "../routes/http-utils";
import type { RouteDispatch } from "../routes/router";
import { registerRoute } from "../routes/router";
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
  detectAssetType,
  validateFileSize,
  validateMimeType,
} from "./service";

interface UploadOpts {
  request: Request;
  context: RequestContext;
  database: Kysely<DB>;
  uploadDir: string;
  maxFileSize: number;
}
interface ServeRawOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
}
interface ServeCompressedOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  variant: string;
}

const dispatch: RouteDispatch = async ({ request, context, database, config }) => {
  // Check assets enabled
  if (!config.assets.enabled) {
    return jsonError({
      message: "Asset system is disabled",
      status: HttpStatus.NotFound,
      code: ErrorCode.NotFound,
    });
  }

  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  const uploadDir = config.assets.uploadDir;
  const maxFileSize = config.assets.maxFileSize;

  // ── /api/assets/:id sub-routes ──────────────────────────────
  const singleMatch = /^\/api\/assets\/([a-f0-9-]+)(\/\w+(?:\/\w+)?)?$/.exec(pathname);
  if (singleMatch) {
    const assetId = singleMatch[1];
    const subRoute = singleMatch[2] ?? "";

    if (method === "GET" && !subRoute) {
      const asset = await getAsset(database, assetId);
      if (!asset)
        return jsonError({
          message: "Asset not found",
          status: HttpStatus.NotFound,
          code: ErrorCode.NotFound,
        });
      return jsonResponse(asset);
    }
    if (method === "GET" && subRoute === "/raw") {
      return handleServeRaw({ database, assetId, uploadDir });
    }
    if (method === "GET" && subRoute === "/download") {
      return handleDownload({ database, assetId, uploadDir });
    }
    if (method === "GET" && (subRoute === "/thumb" || subRoute === "/compressed")) {
      return handleServeCompressed({ database, assetId, uploadDir, variant: subRoute.slice(1) });
    }
    if (method === "DELETE" && !subRoute) {
      const deleted = await deleteAsset({ database, assetId, uploadDir });
      if (!deleted)
        return jsonError({
          message: "Asset not found",
          status: HttpStatus.NotFound,
          code: ErrorCode.NotFound,
        });
      return jsonNoContent();
    }

    // ── Links sub-routes ────────────────────────────────────
    const linkMatch = /^\/links(?:\/([a-f0-9-]+))?$/.exec(subRoute);
    if (linkMatch) {
      const linkId = linkMatch[1] ?? null;

      if (method === "GET" && !linkId) {
        const links = await getAssetLinks(database, assetId);
        return jsonResponse(links);
      }
      if (method === "POST" && !linkId) {
        const body = await request.json();
        await linkAsset({
          database,
          assetId,
          link: body as { entityType: string; entityId: string; label?: string },
        });
        return jsonCreated({ id: assetId });
      }
      if (method === "DELETE" && linkId) {
        const body = (await request.json()) as { entityType?: string; entityId?: string };
        await unlinkAsset({
          database,
          assetId,
          entityType: body.entityType ?? "",
          entityId: body.entityId ?? "",
        });
        return jsonNoContent();
      }
      return jsonError({ message: "Method not allowed for links", status: HttpStatus.BadRequest });
    }

    return jsonError({ message: "Method not allowed", status: HttpStatus.BadRequest });
  }

  // ── /api/assets (collection) ─────────────────────────────
  if (pathname === "/api/assets" && method === "GET") {
    const searchParams = url.searchParams;
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Math.min(Number(searchParams.get("pageSize") ?? "50"), 200);
    const entityType = searchParams.get("entity_type") ?? undefined;
    const entityId = searchParams.get("entity_id") ?? undefined;
    const label = searchParams.get("label") ?? undefined;

    const result = await listAssets(database, { page, pageSize, entityType, entityId, label });
    return jsonPaginated({ data: result.data, total: result.total, page, pageSize });
  }

  if (pathname === "/api/assets" && method === "POST") {
    return handleUpload({ request, context, database, uploadDir, maxFileSize });
  }

  return null; // Not an asset route
};

async function handleUpload({
  request,
  context,
  database,
  uploadDir,
  maxFileSize,
}: UploadOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

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

async function handleServeRaw({ database, assetId, uploadDir }: ServeRawOpts): Promise<Response> {
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
}: ServeCompressedOpts): Promise<Response> {
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
    return handleServeRaw({ database, assetId, uploadDir });
  }

  const data = readFileSync(fullPath);
  return new Response(data, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

async function handleDownload({ database, assetId, uploadDir }: ServeRawOpts): Promise<Response> {
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

registerRoute(dispatch);
export { dispatch };

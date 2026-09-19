// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset matting routes — background-removal trigger, job status, and
 * cut-out (matted variant) serving.
 *
 *   GET  /api/assets/:id/matted — serve the RGBA cut-out derivative (or the
 *                                 asset itself when natively transparent);
 *                                 404 while not available
 *   POST /api/assets/:id/matte  — owner-only enqueue / re-run; 409 while a
 *                                 live job is pending or the asset is not
 *                                 eligible; recovers restart-stuck pending
 *                                 state (in-memory store lost) once
 *   GET  /api/assets/:id/matte  — owner-visible in-memory job status
 *
 * The matted variant is served ONLY when explicitly requested — chat and
 * gallery surfaces keep the opaque original.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { AssetAlphaStatus, AssetLinkEntity, } from "../db/enums";
import type { DB, } from "../db/schema";
import {
  listJobs,
  MATTING_SOURCE_LABEL,
  MattingService,
  resolveMattingProvider,
} from "../generation/matting";
import {
  badRequestResponse,
  forbiddenResponse,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonResponse,
  notFoundResponse,
  requireUserId,
} from "../routes/http-utils";
import { serveFile, } from "./serve-file";
import { resolveForServe, signedUrlAuth, } from "./serve-handlers";
import { getAsset, getAssetFilePath, } from "./service";

interface MattingRouteOpts {
  database: Kysely<DB>;
  config: Config;
}

/** The matted derivative row (joined from asset_links + assets). */
interface MattedDerivativeRow {
  asset_id: string;
  mime_type: string;
  storage_path: string;
}

/**
 * Find the newest matted derivative linked to a raw asset.
 * @param database
 * @param sourceId - raw asset id
 * @returns the derivative row, or null when none is linked
 */
export async function findMattedDerivative(
  database: Kysely<DB>,
  sourceId: string,
): Promise<MattedDerivativeRow | null> {
  const row = await database
    .selectFrom("asset_links",)
    .innerJoin("assets", "assets.id", "asset_links.asset_id",)
    .select([
      "asset_links.asset_id",
      "assets.mime_type",
      "assets.storage_path",
    ],)
    .where("entity_type", "=", AssetLinkEntity.Asset,)
    .where("entity_id", "=", sourceId,)
    .where("label", "=", MATTING_SOURCE_LABEL,)
    .orderBy("asset_links.asset_id", "desc",)
    .executeTakeFirst();
  return row ?? null;
}

/** Serve-options for the matted variant. */
interface ServeMattedOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  actorId: string | null;
  actorRole: string | null;
  signedUrlSecret?: string;
  signedUrlToken?: string;
  signedUrlExpires?: number;
  signedUrlAction?: string;
}

/**
 * Serve the matted cut-out for an asset (natively-transparent assets serve
 * themselves; everything else 404s until a derivative exists).
 * @param opts
 * @returns the PNG response, or an error response
 */
async function handleServeMatted(opts: ServeMattedOpts,): Promise<Response> {
  const resolved = await resolveForServe({
    database: opts.database,
    assetId: opts.assetId,
    actorId: opts.actorId,
    actorRole: opts.actorRole,
    signedUrlSecret: opts.signedUrlSecret,
    signedUrlToken: opts.signedUrlToken,
    signedUrlExpires: opts.signedUrlExpires,
    signedUrlAction: opts.signedUrlAction as never,
  },);
  if (resolved instanceof Response) { return resolved; }
  const { asset, } = resolved;

  if (asset.alpha_status === AssetAlphaStatus.Native) {
    return serveFile(
      getAssetFilePath(opts.uploadDir, asset.storage_path,),
      asset.mime_type,
    );
  }
  if (asset.alpha_status !== AssetAlphaStatus.Matted) {
    return notFoundResponse("No matted derivative available",);
  }

  const derivative = await findMattedDerivative(opts.database, asset.id,);
  if (!derivative) {
    return notFoundResponse("Matted derivative not found",);
  }
  return serveFile(
    getAssetFilePath(opts.uploadDir, derivative.storage_path,),
    derivative.mime_type,
  );
}

/**
 * Asset matting routes plugin.
 * @param root0
 * @param root0.database
 * @param root0.config
 * @param prefix
 * @returns the Elysia plugin mounting the matting routes
 */
export function mattingRoutes(
  { database, config, }: MattingRouteOpts,
  prefix = "/api",
) {
  return (
    new Elysia({ name: "assets-matting", },)
      .guard({
        beforeHandle: () => {
          if (!config.assets.enabled) {
            return notFoundResponse("Asset system is disabled",);
          }
        },
      },)
      .get(`${prefix}/assets/:id/matted`, async (ctx: any,) => {
        const searchParams = new URL(ctx.request.url,).searchParams;
        return handleServeMatted({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          actorId: ctx.userId ?? null,
          actorRole: ctx.userRole ?? null,
          ...signedUrlAuth(searchParams, "matted", config,),
        },);
      },)
      .post(`${prefix}/assets/:id/matte`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const provider = resolveMattingProvider(config,);
        if (!provider) {
          return badRequestResponse(
            "Matting is not configured (generation.matting)",
          );
        }
        const service = new MattingService({
          database,
          uploadDir: config.assets.uploadDir,
          resolveProvider: () => provider,
        },);
        const assetId: string = ctx.params.id;
        let started = await service.startMatting({ assetId, ownerId: userId, },);

        // Restart recovery: `matting_pending` with no live in-memory job
        // means the server restarted mid-job. Reset to matting_failed so the
        // state machine allows a fresh enqueue, then retry once.
        if (!started.ok && started.error === "not_eligible") {
          const asset = await getAsset(database, assetId,);
          const hasLiveJob = asset
            ? listJobs(asset.owner_id,).some(
              (job,) =>
                job.assetId === assetId &&
                (job.status === "pending" || job.status === "running"),
            )
            : false;
          if (
            asset &&
            asset.alpha_status === AssetAlphaStatus.MattingPending &&
            !hasLiveJob
          ) {
            await database
              .updateTable("assets",)
              .set({ alpha_status: AssetAlphaStatus.MattingFailed, },)
              .where("id", "=", assetId,)
              .execute();
            started = await service.startMatting({ assetId, ownerId: userId, },);
          }
        }

        if (!started.ok) {
          switch (started.error) {
            case "asset_not_found":
              return notFoundResponse("Asset not found",);
            case "forbidden":
              return forbiddenResponse("Not the asset owner",);
            case "not_eligible":
              return jsonError({
                message: "Asset is not eligible for matting (unknown/native alpha, or a job is already pending)",
                status: HttpStatus.Conflict,
              },);
          }
        }
        return jsonCreated({ jobId: started.jobId, },);
      },)
      .get(`${prefix}/assets/:id/matte`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const job = listJobs(userId,).find(
          (candidate,) => candidate.assetId === ctx.params.id,
        );
        if (!job) {
          return notFoundResponse("No matting job for this asset",);
        }
        return jsonResponse({
          jobId: job.id,
          status: job.status,
          providerName: job.providerName,
          mattedAssetId: job.mattedAssetId,
          error: job.error,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        },);
      },)
  );
}

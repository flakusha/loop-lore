// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * IVSS fragment run route — starts one render and, for retakes, mints a
 * signed asset URL for ComfyUI boxes that cannot read the local upload dir.
 */
import { type Context, Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { resolveSignedUrlSecret, signAssetUrl, } from "../../assets/signed-url";
import type { Config, VideoProviderConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type {
  IvssComfyClient,
  IvssRunDispatch,
  IvssWorkflowLoader,
} from "../../generation/ivss/run-pipeline";
import { startIvssFragmentRun, } from "../../generation/ivss/run-pipeline";
import { ComfyUIClient, } from "../../generation/providers/comfyui";
import {
  HttpStatus,
  type HttpStatusCode,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";

interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/**
 * Reject fragments outside the caller's scenarios.
 * @param opts - database, fragment id and caller id
 * @returns null when owned, an error response otherwise
 */
async function foreignFragment(opts: {
  database: Kysely<DB>;
  fragmentId: string;
  userId: string;
},): Promise<Response | null> {
  const fragment = await opts.database.selectFrom("scenario_fragments",)
    .select("scene_id",).where("id", "=", opts.fragmentId,).executeTakeFirst();

  if (!fragment) { return jsonError("IVSS fragment not found", HttpStatus.NotFound,); }

  const owner = await opts.database.selectFrom("scenario_scenes",)
    .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
    .select("scenarios.owner_id",)
    .where("scenario_scenes.id", "=", fragment.scene_id,).executeTakeFirst();

  if (!owner) { return jsonError("IVSS fragment not found", HttpStatus.NotFound,); }
  if (owner.owner_id !== opts.userId) {
    return jsonError("IVSS fragment is not owned by the caller", HttpStatus.Forbidden,);
  }

  return null;
}

/**
 * @param opts - config, database, upload dir and injectable run seams
 * @returns Elysia plugin exposing the fragment run endpoint
 */
export function ivssRunRoutes(opts: {
  config: Config;
  database: Kysely<DB>;
  uploadDir: string;
  prefix?: string;
  createClient?: (video: VideoProviderConfig,) => IvssComfyClient;
  loadWorkflow?: IvssWorkflowLoader;
  dispatch?: IvssRunDispatch;
},) {
  const prefix = opts.prefix ?? "/api/v1";
  const providers = opts.config.generation?.providers?.video ?? [];

  return new Elysia({ name: "ivss-run", },)
    .post(`${prefix}/ivss/fragments/:id/run`, async (ctx,) => {
      const c = ctx as unknown as Ctx;
      const userId = requireUserId(c,);
      if (typeof userId !== "string") { return userId; }

      const denied = await foreignFragment({
        database: opts.database,
        fragmentId: ctx.params.id,
        userId,
      },);

      if (denied) { return denied; }

      const video = providers.find((provider,) => provider.apiFamily === "comfyui");
      if (!video) {
        return jsonError("No ComfyUI video provider configured", HttpStatus.ServiceUnavailable,);
      }

      const resumeFromFragmentId = ctx.body.resumeFromFragmentId;
      let assetUrl: ((assetId: string,) => Promise<string>) | undefined;
      if (resumeFromFragmentId) {
        const secret = resolveSignedUrlSecret(
          opts.config.assets.signedUrlSecret,
          opts.config.auth.jwtSecret,
        );

        if (!secret) {
          return jsonError("Signed asset URLs are not configured", HttpStatus.Forbidden,);
        }

        const origin = new URL(ctx.request.url,).origin;
        assetUrl = async (assetId,) => {
          const signed = await signAssetUrl({
            secret,
            assetId,
            action: "raw",
            expiresInSeconds: opts.config.assets.signedUrlExpirySeconds ?? 900,
          },);

          return `${origin}/api/assets/${assetId}/raw?expires=${signed.expiresAt}&sig=${signed.token}`;
        };
      }

      const client = opts.createClient
        ? opts.createClient(video,)
        : new ComfyUIClient({
          baseUrl: video.baseUrl,
          timeout: video.timeout,
          ...(video.apiKey ? { apiKey: video.apiKey, } : {}),
        },);

      try {
        const handle = await startIvssFragmentRun({
          database: opts.database,
          uploadDir: opts.uploadDir,
          ownerId: userId,
          fragmentId: ctx.params.id,
          client,
          providers: [...providers,],
          timeoutMs: video.generationTimeout ?? 300_000,
          ...(resumeFromFragmentId ? { resumeFromFragmentId, } : {}),
          ...(assetUrl ? { assetUrl, } : {}),
          ...(opts.loadWorkflow ? { loadWorkflow: opts.loadWorkflow, } : {}),
          ...(opts.dispatch ? { dispatch: opts.dispatch, } : {}),
        },);

        // Defensive only: the run pipeline's `done` never rejects after claim.
        handle.done.then(() => undefined, () => undefined,);
        return jsonResponse({
          jobId: handle.jobId,
          fragmentId: handle.fragmentId,
          status: "pending",
        }, HttpStatus.Accepted,);
      } catch (error) {
        const status = (error as { status?: number }).status ?? HttpStatus.InternalServerError;
        return jsonError(
          error instanceof Error ? error.message : String(error,),
          status as HttpStatusCode,
        );
      }
    }, {
      body: t.Object({
        resumeFromFragmentId: t.Optional(t.String({ minLength: 1, },),),
      },),
    },);
}

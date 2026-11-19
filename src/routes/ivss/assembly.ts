// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * IVSS scenario assembly routes — read the latest assembly row/history and
 * start a workflow-driven stitch of a scenario's completed fragments.
 */
import { type Context, Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, VideoProviderConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { assembleScenario, getAssembly, listAssemblies, } from "../../generation/ivss/assembly";
import type { IvssComfyClient, } from "../../generation/ivss/run-pipeline";
import { ComfyUIClient, } from "../../generation/providers/comfyui";
import { HttpStatus, type HttpStatusCode, jsonError, jsonResponse, requireUserId, } from "../http-utils";

interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/**
 * Resolve a scenario and reject callers that do not own it.
 * @param opts - database, scenario id and authenticated caller
 */
async function ownedScenario(opts: {
  database: Kysely<DB>;
  scenarioId: string;
  userId: string;
},) {
  const scenario = await opts.database.selectFrom("scenarios",).select(["id", "owner_id",],)
    .where("id", "=", opts.scenarioId,).executeTakeFirst();

  if (!scenario) { return jsonError("Scenario not found", HttpStatus.NotFound,); }
  if (scenario.owner_id !== opts.userId) {
    return jsonError("Scenario is not owned by the caller", HttpStatus.Forbidden,);
  }

  return scenario;
}

/**
 * @param opts - config, database, upload dir and optional client factory
 * @returns Elysia plugin with the assembly endpoints
 */
export function ivssAssemblyRoutes(opts: {
  config: Config;
  database: Kysely<DB>;
  uploadDir: string;
  prefix?: string;
  createClient?: (video: VideoProviderConfig,) => IvssComfyClient;
},) {
  const prefix = opts.prefix ?? "/api/v1";

  return new Elysia({ name: "ivss-assembly", },)
    .get(`${prefix}/ivss/scenarios/:id/assembly`, async (ctx,) => {
      const c = ctx as unknown as Ctx;
      const userId = requireUserId(c,);
      if (typeof userId !== "string") { return userId; }

      const scenario = await ownedScenario({ database: opts.database, scenarioId: ctx.params.id, userId, },);
      if (scenario instanceof Response) { return scenario; }

      const assembly = await getAssembly(opts.database, scenario.id,);
      if (!assembly) { return jsonError("No assembly for this scenario", HttpStatus.NotFound,); }

      return jsonResponse(assembly,);
    },)
    .get(`${prefix}/ivss/scenarios/:id/assemblies`, async (ctx,) => {
      const c = ctx as unknown as Ctx;
      const userId = requireUserId(c,);
      if (typeof userId !== "string") { return userId; }

      const scenario = await ownedScenario({ database: opts.database, scenarioId: ctx.params.id, userId, },);
      if (scenario instanceof Response) { return scenario; }

      return jsonResponse(await listAssemblies(opts.database, scenario.id,),);
    },)
    .post(`${prefix}/ivss/scenarios/:id/assembly`, async (ctx,) => {
      const c = ctx as unknown as Ctx;
      const userId = requireUserId(c,);
      if (typeof userId !== "string") { return userId; }

      const scenario = await ownedScenario({ database: opts.database, scenarioId: ctx.params.id, userId, },);
      if (scenario instanceof Response) { return scenario; }

      const video = (opts.config.generation.providers.video ?? [])
        .find((provider,) => provider.name === "comfyui");

      if (!video) {
        return jsonError("No ComfyUI video provider configured", HttpStatus.ServiceUnavailable,);
      }

      const client = opts.createClient
        ? opts.createClient(video,)
        : new ComfyUIClient({
          baseUrl: video.baseUrl,
          timeout: video.timeout,
          ...(video.apiKey ? { apiKey: video.apiKey, } : {}),
        },);

      try {
        const handle = await assembleScenario({
          database: opts.database,
          uploadDir: opts.uploadDir,
          ownerId: userId,
          scenarioId: ctx.params.id,
          client,
          workflowId: ctx.body.workflowId,
          workflowHash: ctx.body.workflowHash,
          workflowVersion: ctx.body.workflowVersion,
        },);

        // Defensive only: assembleScenario's done never rejects.
        handle.done.then(() => undefined, () => undefined,);
        return jsonResponse({ assemblyId: handle.assemblyId, status: "pending", }, HttpStatus.Accepted,);
      } catch (error) {
        const status = (error as { status?: number }).status ?? HttpStatus.InternalServerError;
        return jsonError(
          error instanceof Error ? error.message : String(error,),
          status as HttpStatusCode,
        );
      }
    }, {
      body: t.Object({
        workflowId: t.String({ minLength: 1, },),
        workflowHash: t.String({ minLength: 1, },),
        workflowVersion: t.Optional(t.String(),),
      },),
    },);
}

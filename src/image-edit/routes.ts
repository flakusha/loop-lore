// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 260

/**
 * Image Edit API Routes — ComfyUI + sd-server unified endpoints
 *
 * POST /api/v1/image-edit/run        — Execute a workflow template
 * GET  /api/v1/image-edit/templates  — List available templates
 * GET  /api/v1/image-edit/nodes      — Discover installed nodes
 * GET  /api/v1/image-edit/capabilities — List backend capabilities
 * GET  /api/v1/image-edit/health        — Health check backends
 * @module image-edit-routes
 */

import { getDatabase, } from "../db";
import { ensureWorkflowRegistry, } from "../generation/workflow-library";
import { API_META, ErrorCode, HttpStatus, jsonError, jsonResponse, parseBody, } from "../routes/http-utils";
import {
  imageEditBodyFields,
  ImageEditRunBody,
  type ImageEditRunBodyT,
  invalidImageParams,
  missingRequiredParams,
  validateImageEditBody,
} from "../validation/schemas";
import { ComfyUIEditProvider, } from "./providers/comfyui-provider";
import { SDServerEditProvider, } from "./providers/sd-server-provider";
import { authorizeRunLinkage, } from "./run-authz";
import type { HandleRunAuth, } from "./run-authz";
import { registerBuiltinTemplates, registerConfigWorkflows, templateRegistry, } from "./template-registry";
import type {
  ImageEditBackend,
  ImageEditProvider,
  ImageEditRequest,
  WorkflowTemplate,
} from "./types";

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import type { DB, } from "../db/schema";

// ── Provider instances ───────────────────────────────────────

/** Shared ComfyUI edit provider — also the builder palette's upstream. */
export const comfyuiProvider = new ComfyUIEditProvider();
const sdServerProvider = new SDServerEditProvider();

/**
 * @param backend
 * @returns the shared provider instance for the backend
 * @throws {Error} when the backend is neither `comfyui` nor `sd-server`
 */
function getProvider(backend: ImageEditBackend,): ImageEditProvider {
  switch (backend) {
    case "comfyui": {
      return comfyuiProvider;
    }

    case "sd-server": {
      return sdServerProvider;
    }

    default: {
      throw new Error(`Unknown backend: ${backend as string}`,);
    }
  }
}

// ── Route Handlers ───────────────────────────────────────────

/**
 * POST /api/v1/image-edit/run — Execute a workflow template
 *
 * Body: { template_id, backend, params, chatId?, messageId? }
 * @param request
 * @param opts
 * @param opts.database
 * @param opts.userId
 * @param opts.userRole
 * @param parsedBody - the body the HTTP boundary already parsed
 * @returns JSON envelope with results, or 401/403/4xx on gate failure.
 */
export async function handleRun(
  request: Request,
  opts?: HandleRunAuth,
  parsedBody?: unknown,
): Promise<Response> {
  const raw = parsedBody ?? (await parseBody<unknown>(request,));
  if (raw instanceof Response) { return raw; }

  // The gate comes first: an unauthenticated caller is told so whether or not
  // the body is well formed, exactly as before the shared schema existed.
  const gate = await authorizeRunLinkage(
    raw as Pick<ImageEditRequest, "chatId" | "messageId">,
    opts ?? {},
  );

  if (gate) { return gate; }

  // The shared schema is the boundary for every entry point: the HTTP route
  // validates the body against it, and so does this handler for the chain-run
  // executor, which calls `handleRun` directly.
  const validation = validateImageEditBody(raw,);
  if (!validation.ok) {
    const fields = validation.fields.filter((field,) => field !== "body");
    const message = fields.length > 0 ? `Invalid request body: ${fields.join(", ",)}` : "Invalid request body";
    return jsonError({ message, status: HttpStatus.BadRequest, },);
  }

  const params = validation.value.params ?? {};
  const body: ImageEditRequest = {
    template_id: validation.value.template_id,
    // The provider rejects an unknown backend, exactly as it always has.
    backend: validation.value.backend as ImageEditBackend,
    params,
    chatId: validation.value.chatId,
    messageId: validation.value.messageId,
  };

  const db = opts?.database ?? getDatabase();
  await ensureWorkflowRegistry(db,).catch(() => 0);
  const template = templateRegistry.get(body.template_id,);
  if (!template) {
    return jsonError({ message: `Unknown template: ${body.template_id}`, status: HttpStatus.NotFound, },);
  }

  if (!template.backends.includes(body.backend,)) {
    return jsonError({
      message: `Template "${body.template_id}" does not support backend "${body.backend}"`,
      status: HttpStatus.BadRequest,
    },);
  }

  const provider = getProvider(body.backend,);

  // The required-parameter and image-parameter checks live in the shared
  // schema module, so this route and the chain path cannot drift apart.
  const missing = missingRequiredParams(template, params,);
  if (missing.length > 0) {
    return jsonError({
      message: `Missing required parameters: ${missing.join(", ",)}`,
      status: HttpStatus.BadRequest,
    },);
  }

  const invalidImages = invalidImageParams(template, params,);
  if (invalidImages.length > 0) {
    return jsonError({
      message: `Invalid image parameters: ${invalidImages.join(", ",)}`,
      status: HttpStatus.BadRequest,
    },);
  }

  try {
    // The gate above guarantees `userId`; the owner is never read from the body.
    const results = await provider.execute(body, template, { ownerId: opts?.userId ?? "", },);
    return jsonResponse({ data: results, },);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    return jsonError({ message: `Image edit failed: ${message}`, status: HttpStatus.InternalServerError, },);
  }
}

/**
 * GET /api/v1/image-edit/templates — List available templates
 *
 * Query params:
 *   backend  — filter by backend (comfyui | sd-server)
 *   category — filter by category (txt2img | img2img | inpaint | upscale | controlnet)
 * @param request
 * @returns {Response}
 */
export function handleTemplates(request: Request,): Response {
  const url = new URL(request.url,);
  const backend = url.searchParams.get("backend",) as ImageEditBackend | null;
  const category = url.searchParams.get("category",);

  let templates: WorkflowTemplate[];

  if (backend && category) {
    templates = templateRegistry.listForBackend(backend,).filter((t,) => t.category === category);
  } else if (backend) {
    templates = templateRegistry.listForBackend(backend,);
  } else if (category) {
    templates = templateRegistry.listByCategory(category as WorkflowTemplate["category"],);
  } else {
    templates = templateRegistry.listAll();
  }

  // Return lightweight summaries (exclude build function)
  const summaries = Array.from(templates, ({ build: _build, ...rest },) => rest,);

  return jsonResponse({ data: summaries, },);
}

/**
 * GET /api/v1/image-edit/nodes — Discover installed ComfyUI nodes
 * @returns {Promise<Response>}
 */
export async function handleNodes(): Promise<Response> {
  try {
    const nodes = await comfyuiProvider.getInstalledNodes();
    return jsonResponse({ data: [...nodes,], },);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    return jsonError({ message: `Node discovery failed: ${message}`, status: HttpStatus.InternalServerError, },);
  }
}

/**
 * GET /api/v1/image-edit/capabilities — List backend capabilities
 * @returns {Promise<Response>}
 */
export async function handleCapabilities(): Promise<Response> {
  const capabilities: Record<string, { healthy: boolean; features: string[] }> = {};

  try {
    capabilities.comfyui = {
      healthy: await comfyuiProvider.healthCheck(),
      features: await comfyuiProvider.listCapabilities(),
    };
  } catch {
    capabilities.comfyui = { healthy: false, features: [], };
  }

  try {
    capabilities["sd-server"] = {
      healthy: await sdServerProvider.healthCheck(),
      features: await sdServerProvider.listCapabilities(),
    };
  } catch {
    capabilities["sd-server"] = { healthy: false, features: [], };
  }

  return jsonResponse({ data: capabilities, },);
}

/**
 * GET /api/v1/image-edit/health — Quick health check for all backends
 * @returns {Promise<Response>}
 */
export async function handleHealth(): Promise<Response> {
  const [comfyuiHealthy, sdServerHealthy,] = await Promise.allSettled([
    comfyuiProvider.healthCheck(),
    sdServerProvider.healthCheck(),
  ],);

  return jsonResponse({
    comfyui: comfyuiHealthy.status === "fulfilled" ? comfyuiHealthy.value : false,
    "sd-server": sdServerHealthy.status === "fulfilled" ? sdServerHealthy.value : false,
  },);
}

/**
 * Mount the image-edit routes as an Elysia group.
 *
 * Registers built-in + config-driven workflow templates on first mount, then
 * exposes the unified ComfyUI / sd-server image-edit endpoints.
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { "image-edit": { templates: { ...; }; }; }; } & { ...; } & { ...; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function imageEditRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  registerBuiltinTemplates();

  try {
    const cfg = loadConfig().templates.imageEdit;
    if (cfg?.workflows && Object.keys(cfg.workflows,).length > 0) {
      registerConfigWorkflows(cfg,);
    }
  } catch {
    // config absent — built-in templates remain available
  }

  return new Elysia({ name: "image-edit", },)
    // A body the shared schema rejects is a bad request, not a server error:
    // the run route has always answered 400 for a body it cannot use, and the
    // chain-run executor answers the same way for the same body.
    .onError((ctx,) => {
      if (ctx.code !== "VALIDATION" && ctx.code !== "PARSE") { return undefined; }

      ctx.set.status = HttpStatus.BadRequest;
      const value = (ctx as { body?: unknown }).body ?? (ctx.error as { value?: unknown }).value;
      const fields = imageEditBodyFields(value,).filter((field,) => field !== "body");
      const message = fields.length > 0 ? `Invalid request body: ${fields.join(", ",)}` : "Invalid request body";
      return { error: message, code: ErrorCode.BadRequest, meta: API_META, };
    },)
    .get(`${prefix}/image-edit/templates`, async ({ request, },) => {
      // DB-backed workflows are hydrated on first use, not at boot, so tests
      // and e2e (which never run start.ts) see the same list the server does.
      // A hydration failure must not blank the built-in templates.
      await ensureWorkflowRegistry(opts.database,).catch(() => 0);
      return handleTemplates(request,);
    },)
    .get(`${prefix}/image-edit/nodes`, () => handleNodes(),)
    .get(`${prefix}/image-edit/capabilities`, () => handleCapabilities(),)
    .get(`${prefix}/image-edit/health`, () => handleHealth(),)
    .post(`${prefix}/image-edit/run`, async (ctx,) => {
      const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
      return handleRun(ctx.request, {
        database: opts.database,
        userId: auth.userId ?? undefined,
        userRole: auth.userRole ?? null,
      }, ctx.body as ImageEditRunBodyT,);
    }, { body: ImageEditRunBody, },);
}

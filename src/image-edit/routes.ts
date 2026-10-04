// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

import { ensureWorkflowRegistry, } from "../generation/workflow-library";
import { HttpStatus, jsonError, jsonResponse, parseBody, } from "../routes/http-utils";
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
 * @returns JSON envelope with results, or 401/403/4xx on gate failure.
 */
export async function handleRun(request: Request, opts?: HandleRunAuth,): Promise<Response> {
  const body = await parseBody<ImageEditRequest>(request,);
  if (body instanceof Response) { return body; }

  const gate = await authorizeRunLinkage(body, opts ?? {},);
  if (gate) { return gate; }

  if (!body.template_id) {
    return jsonError({ message: "Missing required field: template_id", status: HttpStatus.BadRequest, },);
  }

  if (!body.backend) {
    return jsonError({ message: "Missing required field: backend", status: HttpStatus.BadRequest, },);
  }

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

  // Check required parameters
  const missing: string[] = [];
  for (const p of template.parameters) {
    if (p.required && !body.params[p.name]) { missing.push(p.name,); }
  }

  if (missing.length > 0) {
    return jsonError({
      message: `Missing required parameters: ${missing.join(", ",)}`,
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

  if (backend) {
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
      },);
    },);
}

/**
 * Image Edit API Routes — ComfyUI + sd-server unified endpoints
 *
 * POST /api/image-edit/run        — Execute a workflow template
 * GET  /api/image-edit/templates  — List available templates
 * GET  /api/image-edit/nodes      — Discover installed nodes
 * GET  /api/image-edit/capabilities — List backend capabilities
 * GET  /api/image-edit/health     — Health check backends
 *
 * @module image-edit-routes
 */

import { HttpStatus, jsonError, jsonResponse, parseBody, } from "../routes/http-utils";
import { ComfyUIEditProvider, } from "./providers/comfyui-provider";
import { SDServerEditProvider, } from "./providers/sd-server-provider";
import { templateRegistry, } from "./template-registry";
import type {
  ImageEditBackend,
  ImageEditProvider,
  ImageEditRequest,
  WorkflowTemplate,
} from "./types";

// ── Provider instances ───────────────────────────────────────

const comfyuiProvider = new ComfyUIEditProvider();
const sdServerProvider = new SDServerEditProvider();

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
 * POST /api/image-edit/run — Execute a workflow template
 *
 * Body: { template_id, backend, params, chatId?, messageId? }
 */
export async function handleRun(request: Request,): Promise<Response> {
  const body = await parseBody<ImageEditRequest>(request,);
  if (body instanceof Response) { return body; }

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
    const results = await provider.execute(body, template,);
    return jsonResponse({ data: results, },);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    return jsonError({ message: `Image edit failed: ${message}`, status: HttpStatus.InternalServerError, },);
  }
}

/**
 * GET /api/image-edit/templates — List available templates
 *
 * Query params:
 *   backend  — filter by backend (comfyui | sd-server)
 *   category — filter by category (txt2img | img2img | inpaint | upscale | controlnet)
 */
export async function handleTemplates(request: Request,): Promise<Response> {
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
 * GET /api/image-edit/nodes — Discover installed ComfyUI nodes
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
 * GET /api/image-edit/capabilities — List backend capabilities
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
 * GET /api/image-edit/health — Quick health check for all backends
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

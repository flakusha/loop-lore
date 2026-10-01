// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builder palette proxy — forwards the ComfyUI server's node definitions
 * (`GET /object_info`) to the builder UI.
 *
 * SSRF hygiene: the upstream is the *configured* provider base URL only
 * (`ComfyUIEditProvider` builds its client from `loadConfig()`), so no
 * request input ever reaches the fetch URL. Upstream failures map to 502;
 * timeouts map to 504.
 */
import { Elysia, } from "elysia";
import type { ComfyUINodeInfo, } from "../../generation/providers/comfyui";
import { comfyuiProvider, } from "../../image-edit/routes";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";

/** Injectable upstream for tests. */
export interface PaletteDeps {
  getNodeInfo?: () => Promise<Record<string, ComfyUINodeInfo>>;
}

/**
 * True when the failure is a deadline, not an upstream error status.
 * @param error - caught error from the upstream fetch
 * @returns `true` for timeout-shaped failures.
 */
function isTimeoutError(error: unknown,): boolean {
  if (!(error instanceof Error)) { return false; }
  return error.name === "TimeoutError" || /timed?\s*out/i.test(error.message,);
}

/**
 * Handle `GET /comfyui-builder/palette`.
 * @param deps - Optional upstream override (tests)
 * @returns the node-definition palette, or a 502/504 mapping of the failure
 */
export async function handlePalette(deps?: PaletteDeps,): Promise<Response> {
  const getNodeInfo = deps?.getNodeInfo ?? (() => comfyuiProvider.getNodeInfo());
  try {
    const palette = await getNodeInfo();
    return jsonResponse({ data: palette, },);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    return jsonError({
      message: `Palette proxy failed: ${message}`,
      status: isTimeoutError(error,) ? HttpStatus.GatewayTimeout : HttpStatus.BadGateway,
    },);
  }
}

/**
 * @param prefix - Route prefix
 * @returns the Elysia plugin mounting the palette route
 */
export function builderPaletteRoutes(prefix = "/api",) {
  return new Elysia({ name: "comfyui-builder-palette", },)
    .get(`${prefix}/comfyui-builder/palette`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      return handlePalette();
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        502: ErrorResponse,
        504: ErrorResponse,
      },
      detail: { summary: "Proxy the ComfyUI node palette", tags: ["ComfyUI Builder",], },
    },);
}

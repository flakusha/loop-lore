// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — file serving helpers
 */
import { existsSync, readFileSync, } from "node:fs";
import { IMMUTABLE_CACHE_MAX_AGE, } from "../../config/constants";
import { notFoundResponse, } from "../../routes/http-utils";

/**
 * Serve a file from disk with proper headers.
 * @param filePath
 * @param contentType
 * @param opts
 * @param opts.cacheControl
 * @param opts.extraHeaders
 */
export function serveFile(
  filePath: string,
  contentType: string,
  opts?: { cacheControl?: string; extraHeaders?: Record<string, string> },
): Response {
  if (!existsSync(filePath,)) {
    return notFoundResponse("File not found on disk",);
  }
  const data = readFileSync(filePath,);
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": opts?.cacheControl ?? `public, max-age=${IMMUTABLE_CACHE_MAX_AGE}, immutable`,
      "X-Content-Type-Options": "nosniff",
      ...opts?.extraHeaders,
    },
  },);
}

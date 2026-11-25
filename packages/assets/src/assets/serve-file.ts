// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset file serving helper (extracted from ./controller.ts).
 */
import { IMMUTABLE_CACHE_MAX_AGE, } from "../../../../src/config/constants";
import { AssetVisibility, } from "../../../../src/db/enums";
import { notFoundResponse, } from "../../../../src/routes/http-utils";

/**
 * Serve a file from disk with proper headers. Streams via Bun.file so large
 * assets never buffer in JS or block the synchronous driver.
 * @param filePath
 * @param contentType
 * @param opts
 * @param opts.visibility - asset visibility; non-public assets must not be
 * cached by shared caches (private/shared rows are access-controlled).
 * @param opts.extraHeaders
 * @returns file response
 */
export async function serveFile(
  filePath: string,
  contentType: string,
  opts?: { visibility?: AssetVisibility; extraHeaders?: Record<string, string> },
): Promise<Response> {
  const file = Bun.file(filePath,);
  if (!(await file.exists())) {
    return notFoundResponse("File not found on disk",);
  }

  return new Response(file, {
    headers: {
      "Content-Type": contentType,
      // MIME-sniff defense: assets may be attacker-controlled (e.g. SVG).
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": opts?.visibility && opts.visibility !== AssetVisibility.Public
        ? "private, no-store"
        : `public, max-age=${IMMUTABLE_CACHE_MAX_AGE}, immutable`,
      ...opts?.extraHeaders,
    },
  },);
}

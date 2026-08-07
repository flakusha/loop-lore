/**
 * Asset Controller — file serving helpers
 */
import { existsSync, readFileSync, } from "node:fs";
import { IMMUTABLE_CACHE_MAX_AGE, } from "../../config/constants";
import { notFoundResponse, } from "../../routes/http-utils";

/** Serve a file from disk with proper headers. */
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
      ...opts?.extraHeaders,
    },
  },);
}

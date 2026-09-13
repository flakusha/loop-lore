// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GIF search proxy — GET /api/gifs/search?q=&limit=.
 *
 * The provider key stays server-side (explicit opt, else TENOR_API_KEY;
 * wire it into config when a gif-provider section lands — there is no
 * such section today, so an unconfigured proxy answers 501 like the
 * image-generation route does). The browser only sees normalized
 * results. Upstream 429s pass through as 429 so the picker can show a
 * rate-limit toast instead of a generic failure.
 *
 * Owner wiring (not this file):
 *   import { gifSearchRoutes, } from "../routes/gifs/search";
 *   app.use(gifSearchRoutes(handleOpts,),);
 */
import { Elysia, t, } from "elysia";
import type { HandlerOpts, } from "../chat-search/types";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";

/** Route opts — fetchImpl and tenorApiKey are test seams. */
export interface GifSearchOpts extends HandlerOpts {
  fetchImpl?: typeof fetch;
  tenorApiKey?: string;
}

/** Normalized picker result (mirrors the frontend GifResult). */
export interface GifSearchResult {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

const GifSearchQuery = t.Object({
  q: t.String({ minLength: 1, maxLength: 200, },),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 25, default: 12, },),),
},);

interface TenorMediaFormat {
  url: string;
  dims?: number[];
}

interface TenorResult {
  id: string | number;
  title?: string;
  media_formats?: Record<string, TenorMediaFormat | undefined>;
}

interface TenorSearchBody {
  results?: TenorResult[];
}

/**
 * Resolve the Tenor key: explicit opt first, then the environment.
 * @param opts - Route opts carrying the optional explicit key.
 * @returns The key, or null when GIF search is unconfigured.
 */
export function resolveTenorKey(opts: GifSearchOpts,): string | null {
  const explicit = opts.tenorApiKey?.trim();
  if (explicit) {
    return explicit;
  }
  const envKey = process.env.TENOR_API_KEY?.trim();
  return envKey ? envKey : null;
}

/**
 * Normalize a Tenor v2 search payload to picker results.
 * @param body - Upstream Tenor search payload.
 * @param limit - Max results to return.
 */
export function normalizeGifResults(body: TenorSearchBody, limit: number,): GifSearchResult[] {
  const results = Array.isArray(body.results,) ? body.results : [];
  const out: GifSearchResult[] = [];
  for (const item of results) {
    if (out.length >= limit) {
      break;
    }
    const full = item.media_formats?.gif;
    if (!full?.url) {
      continue;
    }
    const tiny = item.media_formats?.tinygif;
    const dims = Array.isArray(full.dims,) ? full.dims : [];
    out.push({
      id: String(item.id,),
      title: item.title ?? "",
      url: full.url,
      previewUrl: tiny?.url ?? full.url,
      width: dims[0] ?? 0,
      height: dims[1] ?? 0,
    },);
  }
  return out;
}

/**
 * @param opts - Handler opts (database/config) plus test seams.
 * @param prefix - API prefix, defaults to /api.
 */
export function gifSearchRoutes(opts: GifSearchOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "gifs-search", },).get(
      `${prefix}/gifs/search`,
      async (ctx: unknown,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") {
          return userId;
        }
        const key = resolveTenorKey(opts,);
        if (!key) {
          return jsonError({
            message: "GIF search is not configured. Set TENOR_API_KEY.",
            status: 501,
          },);
        }
        const query = (ctx as { query: { q: string; limit?: number } }).query;
        const q = query.q.trim();
        if (!q) {
          return jsonError({ message: "Missing required query param: q", status: 400, },);
        }
        const limit = query.limit ?? 12;
        const upstream = new URL("https://tenor.googleapis.com/v2/search",);
        upstream.searchParams.set("q", q,);
        upstream.searchParams.set("key", key,);
        upstream.searchParams.set("limit", String(limit,),);
        upstream.searchParams.set("media_filter", "gif",);
        let res: Response;
        try {
          res = await (opts.fetchImpl ?? fetch)(upstream.toString(),);
        } catch {
          return jsonError({ message: "GIF provider unreachable", status: 502, },);
        }
        if (res.status === 429) {
          return jsonError({
            message: "GIF provider rate limit exceeded, try again shortly",
            status: 429,
          },);
        }
        if (!res.ok) {
          return jsonError({ message: "GIF search failed", status: 502, },);
        }
        const body = await res.json() as TenorSearchBody;
        return jsonResponse({ data: normalizeGifResults(body, limit,), },);
      },
      { query: GifSearchQuery, },
    )
  );
}

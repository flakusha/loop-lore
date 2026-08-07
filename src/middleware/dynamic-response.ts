// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dynamic-response optimization policy.
 *
 * Runtime-templated responses (views, partials, DB-rendered grids, API JSON)
 * are produced as bare `new Response(body, …)` — unminified and uncompressed.
 * The static pipeline (`src/content/`) only touches on-disk files at startup,
 * so dynamic bodies bypass it entirely.
 *
 * This policy closes that gap. Constructed once per server start from
 * `config.dynamicResponse`, then called on every outgoing response at the top
 * of the fetch handler (before the header policy). It performs three steps in
 * order, each independently toggleable:
 *
 *   1. Validate — confirm html/css/js bodies parse. On failure, log a warning
 *      and skip minification (the original body is still served + compressed).
 *   2. Minify — strip whitespace + comments via `src/content/minify`.
 *   3. Compress — apply `Content-Encoding` (br/gzip) negotiated against the
 *      request's `Accept-Encoding`, above a configurable size threshold.
 *
 * Design notes:
 *   - Streaming-safe: SSE (`text/event-stream`) and already-encoded responses
 *     are skipped, so the body stream is never buffered for those.
 *   - Additive: never clobbers an existing `Content-Encoding`.
 *   - Content-type driven: only an allowlist of text types is processed;
 *     images, fonts, and binary passthrough untouched.
 */

import { brotliCompressSync, gzipSync, } from "node:zlib";
import type { DynamicResponseConfig, } from "../config/schema";
import { minifyCSS, minifyHTMLContent, minifyJS, } from "../content/minify";
import type { Logger, } from "../logger";

/** Body content classes this policy knows how to optimize. */
type BodyKind = "html" | "css" | "js" | "json";

/** Options for {@link DynamicResponsePolicy.apply}. */
export interface DynamicApplyOptions {
  /** Incoming request (used for Accept-Encoding negotiation). */
  request: Request;
  /** Response to optimize. */
  response: Response;
}

/** Statuses whose bodies must never be transformed. */
const BODYLESS_STATUS = new Set([204, 205, 304,],);

/**
 * Map a `Content-Type` header to a {@link BodyKind}, or null when the type is
 * outside the optimization allowlist.
 */
function classifyBody(contentType: string,): BodyKind | null {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("text/html",)) { return "html"; }
  if (ct.startsWith("text/css",)) { return "css"; }
  if (ct.startsWith("application/javascript",) || ct.startsWith("text/javascript",)) { return "js"; }
  if (ct.startsWith("application/json",)) { return "json"; }
  return null;
}

export class DynamicResponsePolicy {
  private readonly log: Logger;

  /**
   * @param config - Resolved `dynamicResponse` config block.
   * @param logger - Logger for validation-failure warnings.
   */
  constructor(
    private readonly config: DynamicResponseConfig,
    logger: Logger,
  ) {
    this.log = logger.child({ module: "dynamic-response", },);
  }

  /**
   * Optimize a response: validate → minify → compress, per configuration.
   *
   * @param options - request + response to process
   * @returns A new Response (or the original when no step applies).
   */
  async apply({ request, response, }: DynamicApplyOptions,): Promise<Response> {
    if (!this.config.enabled) { return response; }
    if (!response.body) { return response; }
    if (BODYLESS_STATUS.has(response.status,)) { return response; }
    if (response.headers.has("Content-Encoding",)) { return response; }

    const kind = classifyBody(response.headers.get("content-type",) ?? "",);
    if (!kind) { return response; }

    const original = await response.text();

    // ── Validate + minify ──────────────────────────────────
    const body = this.config.minify || this.config.validate
      ? await this.minifyBody({ request, body: original, kind, },)
      : original;

    // ── Compress ───────────────────────────────────────────
    const headers = new Headers(response.headers,);
    headers.delete("Content-Length",);

    if (this.config.compress) {
      const encoded = this.compressBody({ request, body, },);
      if (encoded) {
        headers.set("Content-Encoding", encoded.encoding,);
        headers.set("Vary", this.mergeVary(headers.get("Vary",),),);
        return new Response(new Uint8Array(encoded.buffer,), { status: response.status, headers, },);
      }
    }

    return new Response(body, { status: response.status, headers, },);
  }

  /**
   * Validate + minify a text body. Minification doubles as validation: the
   * type-specific minifier throws on unparseable html/css/js. On failure the
   * original body is returned unchanged and a warning is logged.
   */
  private async minifyBody({
    request,
    body,
    kind,
  }: {
    request: Request;
    body: string;
    kind: BodyKind;
  },): Promise<string> {
    // JSON has no comments/whitespace worth stripping and no cheap validate
    // step here — leave it for the compression pass.
    if (kind === "json") { return body; }

    try {
      const minified = await this.runMinifier(body, kind,);
      // validate-only mode: confirm parse, discard the minified output.
      return this.config.minify ? minified : body;
    } catch (error) {
      this.log.warn({
        message: "Dynamic response failed validation; serving unminified",
        path: new URL(request.url,).pathname,
        kind,
        error: error instanceof Error ? error.message : String(error,),
      },);
      return body;
    }
  }

  /** Dispatch to the content-module minifier for a given body kind. */
  private async runMinifier(body: string, kind: "html" | "css" | "js",): Promise<string> {
    switch (kind) {
      case "html": {
        return minifyHTMLContent(body,);
      }
      case "css": {
        return minifyCSS(body,);
      }
      case "js": {
        return minifyJS(body,);
      }
    }
  }

  /**
   * Compress a body when it meets the threshold and the client advertises a
   * supported encoding. Returns null when compression should be skipped.
   */
  private compressBody({
    request,
    body,
  }: {
    request: Request;
    body: string;
  },): { encoding: string; buffer: Buffer } | null {
    const buffer = Buffer.from(body, "utf8",);
    if (buffer.length < this.config.compressThreshold) { return null; }

    const accept = (request.headers.get("accept-encoding",) ?? "").toLowerCase();
    const encoding = this.negotiateEncoding(accept,);
    if (!encoding) { return null; }

    const compressed = encoding === "br" ? brotliCompressSync(buffer,) : gzipSync(buffer,);
    return { encoding, buffer: compressed, };
  }

  /**
   * Choose an encoding from the client's Accept-Encoding, honoring the
   * configured preference. Returns null when no supported encoding is offered.
   */
  private negotiateEncoding(accept: string,): "br" | "gzip" | null {
    const hasBr = accept.includes("br",);
    const hasGzip = accept.includes("gzip",);

    switch (this.config.compressAlgorithm) {
      case "br": {
        return hasBr ? "br" : null;
      }
      case "gzip": {
        return hasGzip ? "gzip" : null;
      }
      case "auto": {
        if (hasBr) { return "br"; }
        if (hasGzip) { return "gzip"; }
        return null;
      }
    }
  }

  /** Merge `Accept-Encoding` into an existing Vary header without duplicates. */
  private mergeVary(existing: string | null,): string {
    if (!existing) { return "Accept-Encoding"; }
    const parts = Array.from(existing.split(",",), (p,) => p.trim(),);
    if (parts.some((p,) => p.toLowerCase() === "accept-encoding")) { return existing; }
    return [...parts, "Accept-Encoding",].join(", ",);
  }
}

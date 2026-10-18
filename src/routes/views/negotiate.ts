// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content negotiation for view routes: does this caller want the view-model
 * as JSON instead of markup?
 *
 * Pure — `wantsJsonViewModel()` takes the raw `Accept` header value and
 * answers. Every other representation decision (the htmx fragment, the full
 * page, the `/dynamic/*` redirect) stays exactly where it already lives in the
 * route handler, so adding JSON cannot change what an HTML caller receives.
 *
 * JSON wins only when `application/json` is listed with a strictly higher q
 * value than `text/html` or the any-media wildcard. That keeps a bare
 * wildcard `Accept` and a bare `Accept: text/html` on the markup path, and
 * makes `text/html, application/json;q=0.9` resolve to HTML.
 */

import { jsonStringifyOr, } from "../../utils";

const JSON_MEDIA_TYPE = "application/json";
const HTML_MEDIA_TYPE = "text/html";
const WILDCARD_MEDIA_TYPE = "*/*";

/**
 * @param accept - the request's raw `Accept` header, or `null` when absent
 * @returns true when the caller explicitly prefers the JSON view-model
 */
export function wantsJsonViewModel({ accept, }: { accept: string | null },): boolean {
  if (!accept) {
    return false;
  }

  let jsonQuality = -1;
  let htmlQuality = -1;
  for (const entry of accept.split(",",)) {
    const [rawType = "", ...params] = entry.split(";",).map((part,) => part.trim());
    const quality = Number(params.find((p,) => p.toLowerCase().startsWith("q=",))?.slice(2,) ?? 1,);
    if (rawType === JSON_MEDIA_TYPE) {
      jsonQuality = Math.max(jsonQuality, quality,);
    } else if (rawType === HTML_MEDIA_TYPE || rawType === WILDCARD_MEDIA_TYPE) {
      htmlQuality = Math.max(htmlQuality, quality,);
    }
  }

  return jsonQuality > htmlQuality && jsonQuality > 0;
}

/**
 * @param viewModel - the same object the HTML template bound to
 * @returns the view-model serialized as an `application/json` response
 */
export function jsonViewModelResponse(viewModel: unknown,): Response {
  return new Response(jsonStringifyOr(viewModel,), {
    headers: { "Content-Type": "application/json", },
  },);
}

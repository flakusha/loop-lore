// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch as htmxApiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "world-fetch", },);

/** The unified frontend request helper signature. */
type ApiFetch = typeof htmxApiFetch;

/**
 * Resolve the request helper at call time: htmx.ts publishes the same
 * function on globalThis for bare-global callers, and tests stub either
 * surface — prefer the global so both interception styles work.
 */
function requestFn(): ApiFetch {
  const g = globalThis as { apiFetch?: ApiFetch };
  return g.apiFetch ?? htmxApiFetch;
}

/**
 * GET a world-scoped JSON resource. The one loader every world-page mixin
 * uses for its read calls — keeps the fetch/ok/parse/catch scaffold in one
 * place. Returns null on network failure or non-2xx (callers keep their
 * previous state).
 * @param worldId world the resource lives under (nullish → null)
 * @param path path UNDER the /worlds/:worldId prefix (e.g. "/chats")
 * @returns {Promise<T | null>}
 */
export async function fetchWorldJson<T,>(
  worldId: string | null | undefined,
  path: string,
): Promise<T | null> {
  if (!worldId) { return null; }
  try {
    const res = await requestFn()(`/api/v1/worlds/${worldId}${path}`, {
      headers: { Accept: "application/json", },
    },);

    if (!res.ok) { return null; }
    const body = (await res.json()) as T;
    return body;
  } catch (error) {
    log.warn(`GET ${path} failed`, { error: String(error,), },);
    return null;
  }
}

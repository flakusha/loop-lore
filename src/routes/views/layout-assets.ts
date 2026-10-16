// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { statSync, } from "node:fs";
import { buildHashLookup, } from "../../content/hash-injection";
import { HASH_INJECTION_LINK, HASH_INJECTION_SCRIPT, } from "../../regex/html-sanitize";
import { DIST_PUBLIC_DIR, } from "./constants";

let hashLookupCache: { mtimeMs: number; lookup: Map<string, string> } | null = null;

/**
 * Lookup of logical → hashed asset names over `dist/public`, rebuilt only when
 * that tree's own mtime moves.
 *
 * This renderer reads the RAW `src/views/layout.html`, whose script/link
 * references still name the un-hashed bundles (`/alpine-init.js`). The build
 * emits hashed names only, and `injectContentHashes` rewrites HTML under
 * `dist/public` — a tree this renderer never reads — so without this rewrite
 * every runtime-rendered view 404s its bundle and Alpine never initializes.
 * `window.Alpine` stays undefined, so every `x-data` root and `app()` /
 * `notificationsBell()` call in the layout body itself throws.
 *
 * Hot-path note (runs per rendered view): HASH_INJECTION_SCRIPT/LINK are
 * precompiled regex literals in regex/html-sanitize.ts — never build them per
 * request. This lookup is memoized behind one statSync(dist/public) per render
 * (~1µs syscall); exact invalidation beats a TTL cache because no TTL window
 * can serve a stale bundle URL after a rebuild. Revisit only if the stat or the
 * (mtime-gated, off-request-path) rebuild walk ever shows up in profiles.
 * @returns Map from root-relative logical path to hashed relative path
 */
function getHashLookup(): Map<string, string> {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(DIST_PUBLIC_DIR,).mtimeMs;
  } catch {
    return new Map<string, string>();
  }

  if (hashLookupCache?.mtimeMs === mtimeMs) {
    return hashLookupCache.lookup;
  }

  const lookup = buildHashLookup(DIST_PUBLIC_DIR,);
  hashLookupCache = { mtimeMs, lookup, };
  return lookup;
}

/**
 * Rewrite un-hashed asset references to their hashed build variants. References
 * with no hashed twin are left alone, so a missing or partial build output
 * degrades to the previous behaviour rather than emitting a 404 URL.
 * @param html
 * @returns HTML with resolved asset references
 */
export function resolveHashedAssets(html: string,): string {
  const lookup = getHashLookup();
  if (lookup.size === 0) {
    return html;
  }

  return html
    .replaceAll(HASH_INJECTION_SCRIPT, (_match, ...groups) => {
      const [prefix, filename, suffix,] = groups;
      const hashed = lookup.get(filename,);
      return hashed ? `${prefix}${hashed}${suffix}` : _match;
    },)
    .replaceAll(HASH_INJECTION_LINK, (_match, ...groups) => {
      const [prefix, filename, suffix,] = groups;
      const hashed = lookup.get(filename,);
      return hashed ? `${prefix}${hashed}${suffix}` : _match;
    },);
}

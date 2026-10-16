// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { statSync, } from "node:fs";
import { buildHashLookup, } from "../../content/hash-injection";
import { HASH_INJECTION_LINK, HASH_INJECTION_SCRIPT, } from "../../regex/html-sanitize";
import { DIST_PUBLIC_DIR, } from "./constants";

let hashLookupCache: { dir: string; mtimeMs: number; lookup: Map<string, string> } | null = null;

/**
 * Rewrite un-hashed asset references in a rendered view to their hashed build
 * variants. References with no hashed twin are left alone, so a missing or
 * partial build output degrades to the previous behaviour rather than emitting
 * a 404 URL.
 *
 * The view renderer reads the RAW `src/views/layout.html`, whose script/link
 * references still name the un-hashed bundles (`/alpine-init.js`). The build
 * emits hashed names only, and `injectContentHashes` rewrites HTML under
 * `dist/public` — a tree this renderer never reads — so without this rewrite
 * every runtime-rendered view 404s its bundle and Alpine never initializes.
 * `window.Alpine` stays undefined, so every `x-data` root and `app()` /
 * `notificationsBell()` call in the layout body itself throws.
 *
 * Hot-path note (runs per rendered view): HASH_INJECTION_SCRIPT/LINK are
 * precompiled regex literals in regex/html-sanitize.ts — never build them per
 * request. The lookup is memoized behind one statSync(publicDir) per render
 * (~1µs syscall); exact invalidation beats a TTL cache because no TTL window
 * can serve a stale bundle URL after a rebuild. Revisit only if the stat or the
 * (mtime-gated, off-request-path) rebuild walk ever shows up in profiles.
 * @param html - markup to rewrite
 * @param publicDir - build-output tree holding the hashed names
 * @returns HTML with resolved asset references
 */
export function resolveHashedAssets(html: string, publicDir: string = DIST_PUBLIC_DIR,): string {
  let mtimeMs: number | undefined;
  try {
    mtimeMs = statSync(publicDir, { throwIfNoEntry: false, },)?.mtimeMs;
  } catch {
    // An unreadable tree (EACCES, ELOOP) degrades to the previous behaviour —
    // serve the un-hashed names — instead of failing the render.
    return html;
  }

  if (mtimeMs === undefined) {
    // No build output yet — nothing to resolve against.
    return html;
  }

  let lookup: Map<string, string>;
  // Keyed on the dir as well as its mtime: two trees can share an mtime, and
  // aliasing them would serve one build's names for the other's requests.
  if (hashLookupCache?.dir === publicDir && hashLookupCache.mtimeMs === mtimeMs) {
    lookup = hashLookupCache.lookup;
  } else {
    lookup = buildHashLookup(publicDir,);
    hashLookupCache = { dir: publicDir, mtimeMs, lookup, };
  }

  if (lookup.size === 0) { return html; }
  return html
    .replaceAll(
      HASH_INJECTION_SCRIPT,
      (_match, ...groups) => {
        const [prefix, filename, suffix,] = groups;
        const hashed = lookup.get(filename,);
        return hashed ? `${prefix}${hashed}${suffix}` : _match;
      },
    )
    .replaceAll(
      HASH_INJECTION_LINK,
      (_match, ...groups) => {
        const [prefix, filename, suffix,] = groups;
        const hashed = lookup.get(filename,);
        return hashed ? `${prefix}${hashed}${suffix}` : _match;
      },
    );
}

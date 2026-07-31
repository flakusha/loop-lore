// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content-hash injection for static assets.
 *
 * Scans a directory for files matching `name-<hash>.ext` (from bun build's
 * content-hashed output), then replaces bare `<script src="/name.ext">` and
 * `<link rel="stylesheet" href="/name.ext">` references in HTML files with
 * the hashed variant. This enables aggressive `Cache-Control: immutable`
 * caching in production.
 *
 * The hash pattern matches bun's 8-char hex output (e.g. `alpine-tx4kdwfm.js`).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { extname, } from "node:path";
import { HASH_INJECTION_SCRIPT, HASH_INJECTION_LINK, } from "../regex/html-sanitize";

const HASH_PATTERN = /^(.+)-([a-z0-9]{8})\.((?:js|css))$/;

/** Build a map of logical → hashed filenames from a directory listing. */
function buildHashLookup(dir: string,): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(dir,)) { return map; }

  const entries = readdirSync(dir, { withFileTypes: true, },);
  for (const entry of entries) {
    if (!entry.isFile()) { continue; }
    const match = HASH_PATTERN.exec(entry.name,);
    if (match) {
      const logical = `${match[1]}.${match[3]}`;
      map.set(logical, entry.name,);
    }
  }
  return map;
}

/**
 * Replace src/href references in HTML with content-hashed filenames where available.
 *
 * Searches for /name.ext references (from src=, href=) and replaces with
 * /name-hash.ext if a hash variant exists. Leaves CDN URLs unchanged.
 */
export function injectContentHashes(directory: string,): { replaced: number; skipped: number } {
  const hashLookup = buildHashLookup(directory,);
  if (hashLookup.size === 0) { return { replaced: 0, skipped: 0, }; }

  let totalReplaced = 0;
  let totalSkipped = 0;

  const entries = readdirSync(directory, { withFileTypes: true, },);
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name,).toLowerCase() !== ".html") { continue; }

    const filePath = `${directory}/${entry.name}`;
    let content = readFileSync(filePath, "utf8",);

    // Replace <script src="/foo.js">  →  <script src="/foo-hash.js">
    // Replace <link rel="stylesheet" href="/foo.css">  →  <link href="/foo-hash.css">
    content = content.replaceAll(
      HASH_INJECTION_SCRIPT,
      (_match, prefix: string, filename: string, suffix: string,) => {
        const hashed = hashLookup.get(filename,);
        if (hashed) {
          totalReplaced++;
          return `${prefix}${hashed}${suffix}`;
        }
        totalSkipped++;
        return _match;
      },
    );

    content = content.replaceAll(
      HASH_INJECTION_LINK,
      (_match, prefix: string, filename: string, suffix: string,) => {
        const hashed = hashLookup.get(filename,);
        if (hashed) {
          totalReplaced++;
          return `${prefix}${hashed}${suffix}`;
        }
        totalSkipped++;
        return _match;
      },
    );

    if (totalReplaced > 0) {
      writeFileSync(filePath, content, "utf8",);
    }
  }

  return { replaced: totalReplaced, skipped: totalSkipped, };
}

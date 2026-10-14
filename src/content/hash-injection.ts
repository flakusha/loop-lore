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
import { HASH_INJECTION_LINK, HASH_INJECTION_SCRIPT, } from "../regex/html-sanitize";

/** Bun's content-hash alphabet (base32, no i/l/o/u) — 8 chars per build. */
const HASH_ALPHABET = "[0-9a-hj-km-np-tv-z]";

/** Matches a content-hashed asset basename: `<name>-<8-char bun hash>.<js|css>`. */
const HASH_PATTERN = new RegExp(`^(.+)-(${HASH_ALPHABET}{8})\\.(js|css)$`,);

/**
 * Shared predicate for hashed-asset detection (used by static-files.ts and
 * response-headers.ts). Matches the end of a path: `-<8-char bun hash>.<ext>`.
 */
export const HASHED_ASSET_PATTERN = new RegExp(
  `-${HASH_ALPHABET}{8}\\.(?:js|css|svg|png|jpe?g|webp|gif|woff2?)$`,
);

/**
 * Recursively collect file paths relative to `dir`.
 * @param dir - directory to scan
 * @param prefix - path prefix for recursion ("" at root)
 * @param out - output array for relative paths
 */
function collectFiles(dir: string, prefix: string, out: string[],): void {
  if (!existsSync(dir,)) { return; }
  const entries = readdirSync(dir, { withFileTypes: true, },);
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      collectFiles(`${dir}/${entry.name}`, rel, out,);
    } else if (entry.isFile()) {
      out.push(rel,);
    }
  }
}

/**
 * Build a map of logical → hashed filenames from a directory tree.
 * Keys are root-relative paths (e.g., `css/app.js`); values are basenames
 * of the hashed variant (e.g., `app-abc12345.css`).
 * @param dir
 * @returns Map from root-relative logical path to hashed basename
 */
function buildHashLookup(dir: string,): Map<string, string> {
  const map = new Map<string, string>();
  const files: string[] = [];
  collectFiles(dir, "", files,);
  for (const rel of files) {
    const basename = rel.split("/",).pop() ?? "";
    const match = HASH_PATTERN.exec(basename,);
    if (match) {
      const logical = `${match[1]}.${match[3]}`;
      const slash = rel.lastIndexOf("/",);
      const key = slash === -1 ? logical : `${rel.slice(0, slash + 1,)}${logical}`;
      map.set(key, rel,);
    }
  }

  return map;
}

/**
 * Replace src/href references in HTML with content-hashed filenames where available.
 *
 * Searches for /name.ext references (from src=, href=) and replaces with
 * /name-hash.ext if a hash variant exists. Leaves CDN URLs unchanged.
 * @param directory
 * @returns void
 */
export function injectContentHashes(directory: string,): { replaced: number; skipped: number } {
  const hashLookup = buildHashLookup(directory,);
  if (hashLookup.size === 0) { return { replaced: 0, skipped: 0, }; }

  let totalReplaced = 0;
  let totalSkipped = 0;

  const htmlFiles: string[] = [];
  collectFiles(directory, "", htmlFiles,);
  for (const rel of htmlFiles) {
    if (extname(rel,).toLowerCase() !== ".html") { continue; }

    const filePath = `${directory}/${rel}`;
    let content = readFileSync(filePath, "utf8",);
    let fileReplaced = false;

    // Replace <script src="/foo.js">  →  <script src="/foo-hash.js">
    // Replace <link rel="stylesheet" href="/foo.css">  →  <link href="/foo-hash.css">
    content = content.replaceAll(
      HASH_INJECTION_SCRIPT,
      (_match, prefix: string, filename: string, suffix: string,) => {
        const hashed = hashLookup.get(filename,);
        if (hashed) {
          totalReplaced++;
          fileReplaced = true;
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
          fileReplaced = true;
          return `${prefix}${hashed}${suffix}`;
        }

        totalSkipped++;
        return _match;
      },
    );

    if (fileReplaced) {
      writeFileSync(filePath, content, "utf8",);
    }
  }

  return { replaced: totalReplaced, skipped: totalSkipped, };
}

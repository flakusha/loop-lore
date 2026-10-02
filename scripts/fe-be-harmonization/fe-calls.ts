// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend API-call collection: fetch-shaped calls in TS and hx-* attributes
 * in HTML partials.
 */

import { readFileSync, } from "node:fs";
import path from "node:path";
import { callExtent, type FeCall, lineOf, norm, ROOT, walk, } from "./shared";

const FE_DIRS = ["src/frontend", "src/components", "src/views", "src/partials",];

function qsKeys(raw: string,): string[] {
  const q = raw.split("?",)[1];
  if (!q) { return []; }
  return q.split("&",).map((p,) => p.split("=",)[0]?.trim() ?? "").filter((k,) => k && !k.includes("${",));
}

/** Collect API calls across the FE directories. */
export function scanFe(): FeCall[] {
  const out: FeCall[] = [];
  for (const d of FE_DIRS) {
    for (const f of walk(path.join(ROOT, d,), [".ts", ".html",],)) {
      const src = readFileSync(f, "utf8",);
      const rel = path.relative(ROOT, f,);
      if (f.endsWith(".html",)) {
        const re = /hx-(get|post|put|patch|delete)\s*=\s*"([^"]+)"/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src,)) !== null) {
          const raw = m[2] ?? "";
          if (!raw.startsWith("/",)) { continue; }
          out.push({
            method: (m[1] ?? "get").toUpperCase(),
            path: norm(raw,),
            raw,
            file: rel,
            line: lineOf(src, m.index,),
            bodyKeys: [],
            queryKeys: qsKeys(raw,),
          },);
        }
        continue;
      }
      const re =
        /\b(?:feFetch|apiFetch|safeFetch|fetch)\s*\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src,)) !== null) {
        const lit = m[1] ?? "";
        const raw = lit.slice(1, -1,);
        if (!raw.includes("/api",)) { continue; }
        if (/^https?:/.test(raw,)) { continue; }
        const win = callExtent(src, m.index,);
        const mm = /method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/i.exec(win,);
        const bm = /JSON\.stringify\(\{([^}]*)\}/.exec(win,);
        const bodyKeys = bm ? [...bm[1].matchAll(/(\w+)\s*:/g,),].map((k,) => k[1] ?? "").filter(Boolean,) : [];
        out.push({
          method: (mm?.[1] ?? "GET").toUpperCase(),
          path: norm(raw,),
          raw: raw.slice(0, 90,),
          file: rel,
          line: lineOf(src, m.index,),
          bodyKeys,
          queryKeys: qsKeys(raw,),
        },);
      }
    }
  }
  return out;
}

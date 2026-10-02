// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TypeBox schema loading: required/optional key extraction for every
 * `export const X = t.Object({ ... })` under src/validation/schemas.
 */

import { readFileSync, } from "node:fs";
import path from "node:path";
import { ROOT, walk, } from "./shared";

const SCHEMA_DIR = path.join(ROOT, "src", "validation", "schemas",);

/** Schema name → required/optional body keys. */
export function scanSchemas(): Map<string, { required: string[]; optional: string[] }> {
  const map = new Map<string, { required: string[]; optional: string[] }>();
  for (const f of walk(SCHEMA_DIR, [".ts",],)) {
    const src = readFileSync(f, "utf8",);
    const re = /export const (\w+)\s*=\s*t\.Object\(\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src,)) !== null) {
      const name = m[1] ?? "";
      let i = m.index + m[0].length - 1;
      let depth = 0;
      let end = src.length;
      for (let j = i; j < src.length; j++) {
        if (src[j] === "{") { depth++; }
        if (src[j] === "}") {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      const body = src.slice(i, end,);
      const required: string[] = [];
      const optional: string[] = [];
      for (const lm of body.matchAll(/^\s*(\w+)\s*:/gm,)) {
        const key = lm[1] ?? "";
        if (!key || map.has(`${name}.${key}`,)) { continue; }
        const line = body.slice(0, lm.index ?? 0,).split("\n",).pop() ?? "";
        const full = `${line} ${body.slice(lm.index ?? 0, (lm.index ?? 0) + 80,)}`;
        if (full.includes("t.Optional",)) { optional.push(key,); }
        else { required.push(key,); }
      }
      map.set(name, { required, optional, },);
    }
  }
  return map;
}

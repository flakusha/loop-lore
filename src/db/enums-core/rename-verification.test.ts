/**
 * Encryption tier rename verification — `private` → `at-rest`
 * (BUG-private-tier-no-true-e2e.md, TASK-asymmetric-key-pairs-followup Phase D)
 *
 * Guards against accidental reintroduction of the `EncryptionLevel.Private`
 * symbol. The rename is a clean cutover (no `@deprecated` alias), so any
 * new reference to `EncryptionLevel.Private` outside the documented
 * exempt set is either:
 *   - the literal string `EncryptionLevel.Private` in source code, or
 *   - a stale re-export / legacy helper.
 * Both fail this test.
 */
import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import { join, } from "node:path";

import { describe, expect, test, } from "bun:test";

import { EncryptionLevel, } from "./flags.js";

// ── 1. Direct symbol/value contract ────────────────────────────

describe("EncryptionLevel rename — direct contract", () => {
  test('AtRest member exists and resolves to "at-rest"', () => {
    expect(EncryptionLevel.AtRest,).toBe("at-rest",);
  });

  test('None member still resolves to "none"', () => {
    expect(EncryptionLevel.None,).toBe("none",);
  });

  test('Standard member still resolves to "standard"', () => {
    expect(EncryptionLevel.Standard,).toBe("standard",);
  });

  test("Private member is gone (clean cutover, no @deprecated alias)", () => {
    expect(
      // @ts-expect-error — intentional: the symbol must NOT exist after the rename.
      EncryptionLevel.Private,
    ).toBeUndefined();
  });

  test("encryption-level type union has exactly three members", () => {
    const values = Object.values(EncryptionLevel,).sort();
    expect(values,).toEqual(["at-rest", "none", "standard",],);
  });
});

// ── 2. Source-tree grep guard ──────────────────────────────────
//
// Re-read every `.ts` file under `src/` and assert none contains the
// literal text `EncryptionLevel.Private`, except for the documented
// exempt set (this test file itself uses the symbol intentionally;
// migration 057 records the historical rename event in its docstring).

const SRC_ROOT = join(import.meta.dir, "..", "..",);

// Static literal: use Record for the membership check.
const EXEMPT_FILES: Record<string, true> = {
  [import.meta.path]: true,
  [join(SRC_ROOT, "db/migrations/057_encryption_level_at_rest_rename.ts",)]: true,
};

/**
 * @param dir
 */
function collectTsFiles(dir: string,): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir,);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry,);
    let st;
    try {
      st = statSync(full,);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full,),);
    } else if (st.isFile() && entry.endsWith(".ts",)) {
      out.push(full,);
    }
  }
  return out;
}

const SRC_FILES = collectTsFiles(SRC_ROOT,);

describe("EncryptionLevel rename — source-tree grep guard", () => {
  test("src/ contains at least one .ts file (sanity)", () => {
    expect(SRC_FILES.length,).toBeGreaterThan(0,);
    expect(existsSync(SRC_ROOT,),).toBe(true,);
  });

  test("no .ts file under src/ contains the literal `EncryptionLevel.Private`", () => {
    const offenders: { file: string; line: number; text: string }[] = [];
    for (const file of SRC_FILES) {
      if (EXEMPT_FILES[file]) { continue; }
      const content = readFileSync(file, "utf8",);
      const lines = content.split(/\r?\n/,);
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i] ?? "";
        if (text.includes("EncryptionLevel.Private",)) {
          offenders.push({ file, line: i + 1, text, },);
        }
      }
    }
    if (offenders.length > 0) {
      const formatted = offenders
        .map((o,) => `  ${o.file}:${o.line}  ${o.text.trim()}`)
        .join("\n",);
      throw new Error(
        `Found ${offenders.length} reference(s) to EncryptionLevel.Private in src/:\n${formatted}\n` +
          `The rename to EncryptionLevel.AtRest must be clean — no @deprecated alias.`,
      );
    }
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared macro engine — one `{{macro}}` resolver for prompt templates and
 * slash commands (TASK-shared-macro-engine-for-templates-and-commands).
 *
 * A macro is a double-brace token (`{{name}}`) whose value comes from a
 * plain {@link MacroRegistry}. The engine is pure: no IO, no logger, no
 * globals. Two expansion modes cover the two consumers:
 *
 * - `"literal"` (default): values are inserted verbatim and NEVER rescanned,
 *   so author-controlled pipe values cannot inject macros (commands, pipes).
 * - `"expand-values"`: the result is re-scanned (bounded passes) so nested
 *   macros inside resolved values expand too (prompt templates, where values
 *   are server-side actor fields that may reference other macros).
 *
 * Unknown macro names stay in the output untouched, matching the existing
 * template convention (`resolveTemplate` leaves unknown tokens unchanged).
 * A single backslash immediately before the opening braces escapes the token:
 * `\{{name}}` yields the literal text `{{name}}`.
 */

/** A macro value: a static string or a lazy (pure) resolver. */
export type MacroValue = string | (() => string);

/** Macro name → value. Names are matched case-sensitively after trimming. */
export type MacroRegistry = Record<string, MacroValue>;

/** How resolved values interact with further expansion. */
export type MacroMode = "literal" | "expand-values";

/** Innermost double-brace token: the captured name holds no braces. */
const MACRO_PATTERN = /\{\{([^{}]*)\}\}/g;

/** Bounded re-scan count for `"expand-values"` mode. */
const MAX_EXPANSION_PASSES = 4;

/**
 * Count the consecutive backslashes ending at `end` (exclusive).
 * @param input - Full input string
 * @param end - Index just after the last backslash candidate
 * @returns the run length of backslashes immediately before `end`
 */
function trailingBackslashRun(input: string, end: number,): number {
  let count = 0;
  let idx = end - 1;
  while (idx >= 0 && input[idx] === "\\") {
    count++;
    idx--;
  }

  return count;
}

/**
 * Expand one scan of the input against the registry.
 * @param input - Text to scan
 * @param registry - Macro values (lazy resolvers invoked only on reference)
 * @returns the expanded text plus whether any macro was replaced
 */
function expandOnce(input: string, registry: MacroRegistry,): { text: string; replaced: boolean } {
  let out = "";
  let consumed = 0;
  let replaced = false;

  for (const match of input.matchAll(MACRO_PATTERN,)) {
    const start = match.index;
    if (start === undefined) { continue; }

    const literal = input.slice(consumed, start,);
    const escapeRun = trailingBackslashRun(input, start,);
    const escaped = escapeRun % 2 === 1;
    // An escape consumes one backslash; the surviving backslashes stay literal.
    out += escaped ? literal.slice(0, -1,) : literal;

    const name = (match[1] ?? "").trim();
    const value = name === "" ? undefined : registry[name];
    if (escaped || value === undefined) {
      // Unknown (or escaped) macro: keep the author's spelling untouched.
      out += match[0];
    } else {
      out += typeof value === "string" ? value : value();
      replaced = true;
    }

    consumed = start + match[0].length;
  }

  out += input.slice(consumed,);
  return { text: out, replaced, };
}

/**
 * Expand every `{{macro}}` in the input against the registry.
 *
 * Values are never re-scanned in `"literal"` mode. In `"expand-values"` mode
 * the output is re-scanned until no further replacement occurs or the pass
 * cap hits; leftover tokens stay literal. Escapes are resolved in the first
 * pass only — a value that emits `\{{x}}` is not re-escaped.
 * @param input - Text containing `{{macro}}` tokens
 * @param registry - Macro values; lazy resolvers run only when referenced
 * @param mode - Expansion mode; defaults to `"literal"`
 * @returns the expanded text with unknown macros kept literal
 * @throws {Error} When a lazy macro resolver throws
 */
export function expandMacros(input: string, registry: MacroRegistry, mode: MacroMode = "literal",): string {
  const first = expandOnce(input, registry,);
  if (mode === "literal" || !first.replaced) { return first.text; }

  let text = first.text;
  for (let pass = 1; pass < MAX_EXPANSION_PASSES; pass++) {
    const next = expandOnce(text, registry,);
    text = next.text;
    if (!next.replaced) { break; }
  }

  return text;
}

/**
 * List the macro names a registry serves (sorted, for error/help text).
 * @param registry - Macro values
 * @returns sorted macro names
 */
export function macroNames(registry: MacroRegistry,): string[] {
  return Object.keys(registry,).sort((a, b,) => a.localeCompare(b,));
}

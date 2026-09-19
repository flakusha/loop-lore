// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Core HTML sanitization — leaf module that holds the sanitize pipeline
 * and its underlying patterns. Imported by:
 *  - `html-sanitize.ts` (public barrel for patterns + `sanitizeHtml`)
 *  - `html-sanitize-streaming.ts` (uses `sanitizeHtml` only)
 *
 * Extracted to break the runtime cycle where the streaming wrapper and
 * the barrel re-exported each other.
 *
 * Defense in depth only: the browser sink (`chat-generations.ts`) runs
 * DOMPurify, which is the primary guard. These patterns harden the
 * server-side SSE payload for non-DOM consumers and for the window before
 * DOMPurify runs. Audited vector coverage and the residual risks that are
 * deliberately accepted live in `docs/spec/regex-extraction.md`.
 */

const SCRIPT_OPEN = "<script";
const SCRIPT_CLOSE_OPEN = "</script";
const WORD_CHAR = /[a-z0-9_]/i;
const WHITESPACE = /\s/;

/**
 * Strip `<script>…</script>` spans (case-insensitive) via a single
 * left-to-right scan. Replaces the former `SCRIPT_TAG` regex, whose nested
 * quantifier `(?:(?!<\/script>)<[^<]*)*` backtracks quadratically on input
 * containing many `<` characters with no closing tag — a CPU-exhaustion DoS
 * on untrusted LLM stream output.
 *
 * An opener terminated by `>` with no closing tag is dropped through
 * end-of-input: an unterminated script element runs to EOF and executes.
 * An opener with no `>` at all is kept — the HTML parser discards an
 * unterminated start tag, so the text is inert (and `"<script".repeat(n)`
 * stays linear and unchanged).
 * @param html - The text to scan.
 * @returns The text with `<script>` spans removed.
 */
export function stripScriptTags(html: string,): string {
  const lower = html.toLowerCase();
  const parts: string[] = [];
  let i = 0;

  for (;;) {
    const start = lower.indexOf(SCRIPT_OPEN, i,);
    if (start === -1) {
      parts.push(html.slice(i,),);
      break;
    }
    const afterOpen = start + SCRIPT_OPEN.length;
    const nextChar = html[afterOpen];
    if (nextChar !== undefined && WORD_CHAR.test(nextChar,)) {
      // `<scripture>` etc. — not a script tag; skip past the `<script` prefix.
      parts.push(html.slice(i, afterOpen,),);
      i = afterOpen;
      continue;
    }
    const gt = html.indexOf(">", afterOpen,);
    if (gt === -1) {
      // Incomplete start tag (`<script` with no `>`): discarded by the
      // HTML parser, so the text is inert and must survive.
      parts.push(html.slice(i,),);
      break;
    }
    const closeEnd = findScriptCloseEnd(lower, gt + 1,);
    parts.push(html.slice(i, start,),);
    if (closeEnd === -1) {
      // Terminated opener with no closing tag: the script element runs to
      // end-of-input and executes, so drop the remainder.
      break;
    }
    i = closeEnd;
  }

  return parts.join("",);
}

/**
 * End index (just past `>`) of the first `</script…>` closer at or after
 * `from`, tolerating whitespace between the name and `>` (`</script >`).
 * @param lower Lower-cased input to scan.
 * @param from Index to start scanning from.
 * @returns Index just past the closer, or -1 when no closer terminates.
 */
function findScriptCloseEnd(lower: string, from: number,): number {
  let close = lower.indexOf(SCRIPT_CLOSE_OPEN, from,);
  while (close !== -1) {
    let k = close + SCRIPT_CLOSE_OPEN.length;
    while (k < lower.length && WHITESPACE.test(lower.charAt(k,),)) { k++; }
    if (lower.charAt(k,) === ">") { return k + 1; }
    close = lower.indexOf(SCRIPT_CLOSE_OPEN, close + SCRIPT_CLOSE_OPEN.length,);
  }
  return -1;
}

/** Match inline event handlers with double-quoted attributes */
export const ON_EVENT_DOUBLE = /\bon\w+="[^"]*"/gi;

/** Match inline event handlers with single-quoted attributes */
export const ON_EVENT_SINGLE = /\bon\w+='[^']*'/gi;

/** Match unquoted inline event handlers, tolerating whitespace around the
 *  `=` (`onerror=alert(1)`, `onerror = alert(1)`) — both are valid HTML. */
export const ON_EVENT_UNQUOTED = /\bon\w+\s*=\s*[^\s"'>]+/gi;

/** A navigable URL attribute (`href`/`src`) plus the character preceding it.
 *  Requiring that separator keeps `data-href`-style names and prose out of
 *  the match. Values may be double-quoted, single-quoted, or unquoted — the
 *  unquoted form is a valid `javascript:` vector. */
const URL_ATTR = /([\s"'/<])((?:href|src)\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)/gi;

/** Numeric character references, which the browser decodes inside an
 *  attribute value before the URL parser sees the scheme. */
const NUMERIC_REF = /&#(?:x([\da-f]{1,6})|(\d{1,7}));?/gi;

/** Named character references relevant to scheme evasion. `&Tab;` and
 *  `&NewLine;` decode to characters the URL parser strips. */
const NAMED_REF = /&(colon|tab|newline);/gi;

/**
 * Reduce an attribute value to what the URL parser will see: decode the
 * character references a browser decodes, drop the ASCII whitespace the
 * URL parser strips (tab/CR/LF), then lower-case.
 * @param raw Quoted or unquoted attribute value as written.
 * @returns The normalized value used for scheme matching.
 */
function normalizeUrlValue(raw: string,): string {
  const quoted = raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
  const value = (quoted ? raw.slice(1, -1,) : raw)
    .replace(NUMERIC_REF, (_match, hex?: string, dec?: string,) => {
      const code = Number.parseInt(hex ?? dec ?? "", hex === undefined ? 10 : 16,);
      return Number.isFinite(code,) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code,) : "";
    },)
    .replace(NAMED_REF, (_match, name: string,) => (name.toLowerCase() === "colon" ? ":" : ""),);
  return value.replace(/[\t\n\r\f ]/g, "",).toLowerCase();
}

/**
 * Whether a normalized URL value carries a script-executing scheme.
 * `data:` is deliberately excluded: the tags that could load a `data:`
 * document (`iframe`/`object`/`embed`) are stripped by
 * {@link DANGEROUS_TAGS}, and current browsers block top-level `data:`
 * navigation.
 * @param normalized Value from {@link normalizeUrlValue}.
 * @returns `true` when the value is a script URL.
 */
function isUnsafeUrlValue(normalized: string,): boolean {
  return /^(?:javascript|vbscript):/.test(normalized,);
}

/**
 * Remove `href`/`src` attributes whose value resolves to a script-executing
 * scheme. Covers unquoted values, character-reference encoding
 * (`&#106;avascript:`), and interior whitespace (`java\tscript:`) that the
 * URL parser strips.
 * @param html HTML to scan.
 * @returns HTML with unsafe URL attributes removed.
 */
export function stripUnsafeUrlAttributes(html: string,): string {
  return html.replace(URL_ATTR, (match, prefix: string, _attr: string, value: string,) =>
    isUnsafeUrlValue(normalizeUrlValue(value,),) ? prefix : match,);
}

/** Match dangerous HTML tags that should be stripped entirely (including
 *  their content). Script tags are handled separately by `stripScriptTags`.
 *  Input tags are produced by markdown task lists and must NOT be stripped —
 *  only their dangerous attributes (event handlers, javascript: URLs) are
 *  removed by the other patterns. `link`/`meta` are void tags that can load
 *  a stylesheet or issue a refresh once injected into the rendered bubble. */
export const DANGEROUS_TAGS =
  /<(?:iframe|object|embed|style|base|form|button|svg|math|link|meta)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|style|base|form|button|svg|math|link|meta)>|<(?:iframe|object|embed|style|base|form|button|svg|math|link|meta)\b[^>]*\/?>/gi;

/**
 * Sanitize untrusted HTML for the SSE bubble payload. Single source of
 * truth for which patterns apply in which order; streaming and
 * non-streaming callers both route through here.
 * @param html Raw HTML to sanitize.
 * @returns Sanitized HTML with dangerous patterns stripped.
 */
export function sanitizeHtml(html: string,): string {
  return stripUnsafeUrlAttributes(
    stripScriptTags(html,)
      .replaceAll(ON_EVENT_DOUBLE, "",)
      .replaceAll(ON_EVENT_SINGLE, "",)
      .replaceAll(ON_EVENT_UNQUOTED, "",)
      .replaceAll(DANGEROUS_TAGS, "",),
  );
}

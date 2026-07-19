/**
 * Delimiter utilities for prompt section wrapping.
 *
 * Design decision: nonce attributes are stored in the database for auditing
 * but STRIPPED before sending to the LLM. Instruction-tuned models are trained
 * on static HTML/XML (e.g., `<tag>content</tag>`) — nonce attributes are foreign
 * noise that wastes context tokens without improving model parsing.
 *
 * Injection protection: before wrapping, user-supplied content is escaped
 * per format so an attacker cannot inject section-closing delimiters.
 *
 * Session nonce: retained in the DB (`session_nonce` field) for audit trails
 * and future server-side validation hooks. Not sent to the LLM.
 *
 * ## Wrapper Formats
 *
 * | Format    | Output                              | Model compatibility              |
 * |-----------|-------------------------------------|----------------------------------|
 * | `xml`     | `<tag>\ncontent\n</tag>`            | Instruction-tuned (HTML/XML)     |
 * | `fence`   | ``` ``tag\ncontent\n``` ```         | Code-aware, non-XML future models|
 * | `sentinel`| `<<tag>>content<</tag>>`            | OpenAI-style guidance legacy     |
 */

export type WrapperFormat = "xml" | "fence" | "sentinel";

let _sessionNonce: string | null = null;

export function getSessionNonce(): string {
  if (!_sessionNonce) {
    const bytes = new Uint8Array(12,);
    crypto.getRandomValues(bytes,);
    _sessionNonce = btoa(String.fromCharCode(...bytes,),)
      .replace(/=+$/, "",)
      .slice(0, 12,);
  }
  return _sessionNonce;
}

export function escapeXml(content: string,): string {
  return content.replaceAll("&", "&amp;",).replaceAll("<", "&lt;",).replaceAll(">", "&gt;",);
}

function escapeFence(content: string,): { escaped: string; fenceLen: number } {
  let maxBackticks = 0;
  const match = content.match(/`{3,}/g,);
  if (match) {
    for (const run of match) {
      if (run.length > maxBackticks) { maxBackticks = run.length; }
    }
  }
  const fenceLen = Math.max(3, maxBackticks + 1,);
  return { escaped: content, fenceLen, };
}

function escapeSentinel(content: string, tag: string,): string {
  return content
    .replaceAll(new RegExp(`<<${tag}>>`, "g",), `[${tag}]`,)
    .replaceAll(new RegExp(`<</${tag}>>`, "g",), `[/${tag}]`,);
}

function wrapXml(tag: string, content: string,): string {
  const safe = escapeXml(content,);
  return `<${tag}>\n${safe}\n</${tag}>`;
}

function wrapFence(tag: string, content: string,): string {
  const { escaped, fenceLen, } = escapeFence(content,);
  const fence = "`".repeat(fenceLen,);
  return `${fence}${tag}\n${escaped}\n${fence}`;
}

function wrapSentinel(tag: string, content: string,): string {
  const safe = escapeSentinel(content, tag,);
  return `<<${tag}>>\n${safe}\n<</${tag}>>`;
}

/**
 * Wrap a section's content with the given delimiter format.
 * Content is escaped per format to prevent delimiter injection.
 *
 * @param tag     Section tag name (e.g. "lore", "memory_context")
 * @param content The section's textual content
 * @param format  Wrapper format — "xml" (default), "fence", or "sentinel"
 */
export function wrapContent(tag: string, content: string, format: WrapperFormat = "xml",): string {
  switch (format) {
    case "fence": {
      return wrapFence(tag, content,);
    }
    case "sentinel": {
      return wrapSentinel(tag, content,);
    }
    case "xml":
    default: {
      return wrapXml(tag, content,);
    }
  }
}

/**
 * Convenience alias — wraps content in XML tags. Kept for backward compatibility
 * with existing section builders. Calls wrapContent(tag, content, "xml").
 */
export function wrapSection(tag: string, content: string,): string {
  return wrapContent(tag, content, "xml",);
}

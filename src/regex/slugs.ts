/**
 * Slugification and Sanitization Regex Patterns
 *
 * Patterns for creating safe filenames, slugs, and sanitized strings.
 *
 * Sources: src/routes/export.ts, src/routes/export-sse.ts, src/routes/chat-export.ts,
 *          src/routes/characters.ts, src/routes/chats.ts, src/assets/controller.ts
 */

/** Replace non-alphanumeric characters with underscore (for filenames) */
export const SLUG_SAFE = /[^a-z0-9]/gi;

/** Replace non-word chars, dots, and hyphens (for safe filenames) */
export const FILENAME_SAFE = /[^\w.-]+/g;

/** Strip leading/trailing quotes from strings */
export const STRIP_QUOTES = /^["']|["']$/g;

/** Strip HTML tags from strings */
export const STRIP_HTML_TAGS = /<[^>]*>/g;

/** Remove double spaces */
export const DOUBLE_SPACES = / {2,}/g;

/** Fix space before punctuation */
export const SPACE_BEFORE_PUNCT = / ([.,!?;:])/g;

/** Remove data-testid attributes from HTML */
export const REMOVE_DATA_TESTID = /\s+data-testid="[^"]*"/g;

/** Remove :data-testid attributes from HTML */
export const REMOVE_COLON_DATA_TESTID = /\s+:data-testid="[^"]*"/g;

/** Remove class attributes from SVG */
export const REMOVE_SVG_CLASS = /\s+class="[^"]*"/g;

/** Git worktree detection: gitdir: <path> */
export const GITDIR_LINE = /^gitdir:\s*(.+)$/;

/** Model size pattern: 10B, 1.5B, 70b etc. */
export const MODEL_SIZE = /(\d+(?:\.\d+)?\s*[bB])/i;

/** Hashed asset names: -abc12345.js, -def67890.css etc. */
export const HASHED_ASSET = /-[a-z0-9]{8}\.(?:js|css|svg|png|jpe?g|webp|gif|woff2?)$/;

/** Hash-patterned filenames: name-abc12345.js, name-abc12345.css */
export const HASH_FILENAME = /^(.+)-([a-z0-9]{8})\.((?:js|css))$/;

/** Keyword splitting for prompt generation */
export const KEYWORD_SPLIT = /[^a-z0-9]+/i;

/** Greeting/filler words to strip from chat auto-rename */
export const GREETING_FILLER = /^(hey|hi|hello|yo|sup|what's up|so|well|um|uh|like)\s*/i;

/** Proper noun extraction (multi-word, 2-5 words) */
export const PROPER_NOUN_EXTRACT = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g;

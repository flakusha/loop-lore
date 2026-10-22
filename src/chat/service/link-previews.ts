// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generic link-preview unfurl (TASK-link-previews-unfurl).
 *
 * Fetches a URL server-side, parses OpenGraph meta tags, and caches the
 * result in `link_previews` (7-day TTL against `fetched_at`). Music links
 * are excluded — `src/chat/music-links/` owns that path and stays
 * specialized. Security posture: http(s) only, private-IP/localhost
 * SSRF-guard, 3s timeout, 1MB response cap; stored strings are length-capped
 * and rendered client-side via x-text (never innerHTML).
 *
 * Known constraint (accepted): the host check is textual — `safeFetch` uses
 * the OS resolver and does not pin the resolved IP, so a DNS-rebinding
 * attack (public hostname that flips to a private A record between check
 * and fetch) is not prevented here. Mitigating factors: one fetch per
 * cache miss, 3s timeout, no credential forwarding, and the response body
 * is parsed for meta tags only.
 */
import type { Kysely, } from "kysely";
import { createHash, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { toDate, } from "../../utils/date";
import { safeFetch, } from "../../utils/safe-fetch";
import { checkChatAccess, } from "./access";
import type { ServiceError, } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

/** Sanitized OpenGraph preview for one URL. */
export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

/** */
export interface UnfurlParams {
  database: Kysely<DB>;
  chatId: string;
  userId: string;
  userRole: string | null;
  url: string;
}

/** */
export type UnfurlResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; error: ServiceError };

// ── Limits ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 500;
const MAX_URL_LENGTH = 2048;

/** Music-service domains owned by src/chat/music-links — never unfurled here. */
const MUSIC_DOMAINS = [
  "spotify.com",
  "music.youtube.com",
  "soundcloud.com",
  "bandcamp.com",
  "music.apple.com",
];

// ── SSRF guard ─────────────────────────────────────────────────────────────

/** True when the URL's host is a loopback/private/link-local target. */
export function isPrivateHost(rawUrl: string,): boolean {
  let host: string;
  try {
    host = new URL(rawUrl,).hostname.toLowerCase().replace(/\.$/, "",);
  } catch {
    return true;
  }

  if (host === "localhost" || host.endsWith(".localhost",) || host.endsWith(".local",)) { return true; }
  if (host.endsWith(".internal",) || host === "metadata.google.internal") { return true; }
  // IPv6 literal: fail closed on ipv4-mapped forms — the embedded v4 may
  // point at a private range and legitimate public sites do not serve
  // `::ffff:` literals. Loopback/unspecified/ULA/link-local are private.
  const v6 = host.replace(/^\[/, "",).replace(/\]$/, "",);
  if (v6.includes(":",)) {
    const lowered = v6.toLowerCase();
    if (lowered.startsWith("::ffff:",)) { return true; }
    return lowered === "::1" || lowered === "::" || lowered.startsWith("fc",) || lowered.startsWith("fd",) ||
      lowered.startsWith("fe8",) || lowered.startsWith("fe9",) || lowered.startsWith("fea",) ||
      lowered.startsWith("feb",);
  }

  // Non-dotted integer hosts (`http://2130706433` = 127.0.0.1) and hex hosts
  // (`0x7f000001`) resolve to loopback/private via the OS resolver — reject.
  if (/^\d+$/.test(host,) || /^0[xX][0-9a-fA-F]+$/.test(host,)) { return true; }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,);
  if (v4) {
    // Leading-zero labels are octal-ambiguous across resolvers — fail closed.
    if (v4.slice(1,).some((part,) => part.length > 1 && part.startsWith("0",))) { return true; }
    const [a, b,] = [Number(v4[1],), Number(v4[2],),];
    if (a === 0 || a === 10 || a === 127) { return true; }
    if (a === 169 && b === 254) { return true; }
    if (a === 172 && b >= 16 && b <= 31) { return true; }
    if (a === 192 && b === 168) { return true; }
    if (a === 100 && b >= 64 && b <= 127) { return true; }
    if (a >= 224) { return true; }
    return false;
  }

  return false;
}

/** True when the URL belongs to a music service handled by music-links. */
export function isMusicDomain(rawUrl: string,): boolean {
  try {
    const host = new URL(rawUrl,).hostname.toLowerCase();
    return MUSIC_DOMAINS.some((d,) => host === d || host.endsWith(`.${d}`,));
  } catch {
    return true;
  }
}

/**
 * Validate a preview target: absolute http(s) URL, length-capped, not
 * private, not a music-service link.
 * @throws never — returns a ServiceError instead
 */
export function validatePreviewUrl(rawUrl: string,): ServiceError | null {
  if (rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    return { code: "bad_request", message: "Invalid URL", };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl,);
  } catch {
    return { code: "bad_request", message: "Invalid URL", };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { code: "bad_request", message: "Only http(s) URLs can be previewed", };
  }

  if (isPrivateHost(rawUrl,)) {
    return { code: "bad_request", message: "Private network URLs cannot be previewed", };
  }

  if (isMusicDomain(rawUrl,)) {
    return { code: "bad_request", message: "Music links use the dedicated music preview", };
  }

  return null;
}

// ── OpenGraph parsing ──────────────────────────────────────────────────────

/** Strip control characters and cap length. */
function sanitizeMeta(value: string, max: number,): string | null {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ",).replace(/\s+/g, " ",).trim();
  if (cleaned.length === 0) { return null; }
  return cleaned.slice(0, max,);
}

/**
 * Extract og:title / og:description / og:image (falling back to <title>)
 * from an HTML document. Pure string parsing — no DOM, no eval; values are
 * treated as text downstream (x-text) so entity/HTML injection is inert.
 * @param html
 */
export function parseOpenGraph(
  html: string,
): { title: string | null; description: string | null; imageUrl: string | null } {
  const meta = (name: string,): string | null => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i",
    );

    const tag = re.exec(html,)?.[0] ?? "";
    const content = /content=["']([^"']*)["']/i.exec(tag,)?.[1];
    return content
      ? sanitizeMeta(
        content,
        name === "og:image" ? MAX_URL_LENGTH : name === "og:description" ? MAX_DESCRIPTION : MAX_TITLE,
      )
      : null;
  };

  const title = meta("og:title",) ?? sanitizeMeta(/<title[^>]*>([^<]*)<\/title>/i.exec(html,)?.[1] ?? "", MAX_TITLE,);
  return {
    title,
    description: meta("og:description",),
    imageUrl: meta("og:image",),
  };
}

// ── Service ────────────────────────────────────────────────────────────────

function hashUrl(url: string,): string {
  return createHash("sha256",).update(url,).digest("hex",);
}

/** Fetch the URL with a hard timeout and 1MB cap. */
async function fetchDocument(url: string,): Promise<string | null> {
  const result = await safeFetch<string>(url, {
    timeout: FETCH_TIMEOUT_MS,
    maxSize: MAX_RESPONSE_BYTES,
    parseJson: false,
    redirect: "follow",
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "loop-lore-link-preview/1.0",
    },
  },);

  if (!result.ok || typeof result.data !== "string") { return null; }
  return result.data;
}

/**
 * Unfurl a URL for a chat participant: cache-first (7-day TTL),
 * SSRF-guarded fetch of at most one document per miss.
 * @throws never — returns a Result instead
 */
export async function unfurlLinkPreview(
  params: UnfurlParams,
): Promise<UnfurlResult> {
  const { database, chatId, userId, userRole, url, } = params;
  const access = await checkChatAccess(database, chatId, userId, userRole,);
  if (!access.ok) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  const invalid = validatePreviewUrl(url,);
  if (invalid) { return { ok: false, error: invalid, }; }

  const urlHash = hashUrl(url,);
  const cached = await database
    .selectFrom("link_previews",)
    .select(["url", "title", "description", "image_url", "fetched_at",],)
    .where("url_hash", "=", urlHash,)
    .executeTakeFirst();

  if (cached) {
    const age = Date.now() - toDate(cached.fetched_at,).getTime();
    if (Number.isFinite(age,) && age < TTL_MS) {
      return {
        ok: true,
        preview: {
          url: cached.url,
          title: cached.title,
          description: cached.description,
          imageUrl: cached.image_url,
        },
      };
    }
  }

  let html: string | null = null;
  try {
    html = await fetchDocument(url,);
  } catch {
    html = null;
  }

  if (html === null) {
    return { ok: false, error: { code: "bad_request", message: "Preview fetch failed", }, };
  }

  const og = parseOpenGraph(html,);
  await database
    .insertInto("link_previews",)
    .values({
      id: crypto.randomUUID(),
      url_hash: urlHash,
      url,
      title: og.title,
      description: og.description,
      image_url: og.imageUrl,
    },)
    .onConflict((oc,) =>
      oc.column("url_hash",).doUpdateSet({
        title: og.title,
        description: og.description,
        image_url: og.imageUrl,
        fetched_at: new Date().toISOString(),
      },)
    )
    .execute();

  return {
    ok: true,
    preview: { url, title: og.title, description: og.description, imageUrl: og.imageUrl, },
  };
}

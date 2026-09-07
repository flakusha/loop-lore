// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Captcha/challenge detection for scrape-path search providers.
 *
 * Official APIs (Brave/Google/Bing/Tavily) never serve captchas — they
 * return 429/403 with `Retry-After`. This detector targets HTML scrape
 * paths (DuckDuckGo, SearXNG upstreams) where a 200 can still be a
 * challenge page. Match is fail-fast: any hit means quarantine, no retry.
 */

const BODY_MARKERS = [
  "captcha",
  "verify you are human",
  "unusual traffic",
  "anomaly-modal",
  "cf-challenge",
  "datadome",
  "perimeterx",
  "please verify",
  "challenge-platform",
] as const;

const URL_MARKERS = [
  "/challenge",
  "sorry",
  "validate",
  "captcha",
  "challenge-platform",
] as const;

/** Minimal shape needed to judge a provider HTTP response. */
export interface SearchHttpResponse {
  status: number;
  url?: string;
  body?: string;
  headers?: Record<string, string>;
}

/**
 * True when the response is a captcha/challenge page.
 * @param res - Provider HTTP response snapshot
 * @returns True → throw `CaptchaBlockedError`, never retry same provider
 */
export function isCaptchaResponse(res: SearchHttpResponse,): boolean {
  const url = (res.url ?? "").toLowerCase();
  if (URL_MARKERS.some((m,) => url.includes(m,))) { return true; }
  // Challenge pages often arrive as 200/202/403 with a form, not a 429.
  if (res.status === 429) { return false; }
  const body = (res.body ?? "").toLowerCase().slice(0, 8000,);
  return BODY_MARKERS.some((m,) => body.includes(m,));
}

/**
 * Parse `Retry-After` (seconds or HTTP-date) into ms.
 * @param value - Raw header value or null
 * @param nowMs - Clock for HTTP-date math (default `Date.now()`)
 * @returns Delay in ms, or null when absent/unparseable
 */
export function parseRetryAfter(value: string | null, nowMs: number = Date.now(),): number | null {
  if (value == null || value.trim() === "") { return null; }
  const secs = Number(value,);
  if (Number.isFinite(secs,) && secs >= 0) { return Math.min(secs, 3600,) * 1000; }
  const at = Date.parse(value,);
  if (Number.isFinite(at,)) { return Math.max(0, Math.min(at - nowMs, 3600_000,),); }
  return null;
}

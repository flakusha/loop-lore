// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Isolated decoy listener (design §3 / §8.1).
 *
 * No DB, session, app or plugin imports: this module cannot read real data
 * even if a caller supplies a forged credential. Every token it emits is
 * example-only and inert. Never enabled by default — the caller owns bind
 * exposure and shutdown.
 */
import {
  createRateLimiter,
  type RateLimiter,
  rateLimitHeaders,
  type RateLimitResult,
} from "../middleware/rate-limit";
import { jsonStringifyOr, } from "../utils";

/** A served decoy request. Never carries a request body. */
export interface DecoyHit {
  readonly at: string;
  readonly ip: string | null;
  readonly kind: "bait" | "breach" | "fake-auth" | "report" | "robots" | "unknown";
  readonly method: string;
  readonly path: string;
}

/** Literal-only deny rule; no CIDR or regex work on the decoy hot path. */
export interface DecoyDenyRule {
  ip?: string;
  userAgent?: string;
}

/** Options for {@link startDecoyListener}. */
export interface DecoyListenerOptions {
  /** Bind host. Defaults to loopback — public exposure is an explicit choice. */
  readonly host?: string;
  /** Bind port. 0 asks the OS for a free port (tests). */
  readonly port?: number;
  /** Refuse request bodies above this many bytes. Default 1024. */
  readonly maxBodyBytes?: number;
  /** Requests per sliding window per source IP. Default 30. */
  readonly maxRequestsPerWindow?: number;
  /** Literal IP / user-agent deny rules from the optional config file. */
  readonly denyRules?: readonly DecoyDenyRule[];
  /** Maximum simultaneous delayed responses. Default 4. */
  readonly maxConcurrentTarpits?: number;
  /** Hit sink. Must not throw — it is called inline on the request path. */
  readonly onHit?: (hit: DecoyHit,) => void;
  /** Delay in ms on repeated bait hits, capped at 500. Default 0 (off). */
  readonly tarpitMs?: number;
  /** Sliding-window length in ms. Default 60_000. */
  readonly windowMs?: number;
}

/** Handle for a running decoy listener. */
export interface DecoyListener {
  /** Concrete origin, including the OS-assigned port when port=0. */
  readonly url: string;
  /** Stop serving, release the limiter timer, and wait for in-flight work. */
  stop(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost",],);

/**
 * Boot preflight for public decoy exposure. The decoy module stays config-free;
 * the caller passes the real app's resolved auth setting.
 * @param host - decoy bind host
 * @param authRequired - `auth.required` from the real app config
 * @throws when a public bind is paired with `auth.required=false`
 */
export function assertPublicDecoyAllowed(host: string, authRequired: boolean,): void {
  if (!LOOPBACK_HOSTS.has(host.trim().toLowerCase(),) && authRequired !== true) {
    throw new Error("Public honeypot bind requires auth.required=true on the real app",);
  }
}

const DEFAULT_MAX_BODY_BYTES = 1024;
const DEFAULT_MAX_CONCURRENT_TARPITS = 4;
const DEFAULT_MAX_REQUESTS = 30;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_TARPIT_MS = 500;
const TARPIT_AFTER = 5;
const NO_STORE = "no-store";
const ROBOTS = [
  "User-agent: *",
  "Disallow: /admin",
  "Disallow: /moderator",
  "Disallow: /api/",
  "Disallow: /report-security",
  "Disallow: /trap/",
  "",
].join("\n",);

/** Fixed fixture pages. Synthetic only; no real identity or host names. */
const BAIT_PAGES: Readonly<Record<string, string>> = {
  "/": [
    "<!doctype html><title>Instance</title>",
    "<h1>Instance</h1>",
    '<a href="/admin/login">staff</a>',
    '<a href="/moderator/queue">moderation</a>',
    '<a href="/api/v1/admin/config">config</a>',
    '<a href="/trap/sitemap.xml">sitemap</a>',
    '<a href="/trap/breach">incident</a>',
    '<a href="/report-security">report</a>',
  ].join("",),
  "/admin":
    '<!doctype html><title>Staff</title><form action="/api/v1/auth/login" method="post"><input name="username"><input name="password" type="password"><button>Sign in</button></form>',
  "/admin/login":
    '<!doctype html><title>Staff sign in</title><form action="/api/v1/auth/login" method="post"><input name="username"><input name="password" type="password"><button>Sign in</button></form>',
  "/moderator": "<!doctype html><title>Moderation</title><p>Queue unavailable.</p>",
  "/moderator/queue": "<!doctype html><title>Moderation queue</title><p>Queue unavailable.</p>",
  "/api/v1/admin/config": '{"mode":"example","notice":"synthetic fixture"}',
  "/api/v1/users": '{"users":[{"id":"example-user","role":"reader"}]}',
  "/trap/sitemap.xml": '<?xml version="1.0"?><urlset><loc>/admin</loc><loc>/moderator/queue</loc></urlset>',
  "/trap/breach":
    "<!doctype html><title>Incident notice</title><p>Synthetic fixture: this service was already compromised. No real data or credentials.</p>",
  "/report-security":
    "<!doctype html><title>Report security</title><p>Synthetic fixture. Report findings out of band; this page accepts no input.</p>",
};

/**
 * Build a reply with headers that never invite indexing or caching.
 * @param body
 * @param status
 * @param contentType
 */
function reply(body: string, status = 200, contentType = "text/html; charset=utf-8",): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": NO_STORE,
      "Content-Type": contentType,
      "X-Robots-Tag": "noindex, nofollow",
    },
  },);
}

/**
 * Classify a decoy path. Report only counts after repeated hits.
 * @param path
 * @param gate
 */
function decoyKind(path: string, gate: RateLimitResult,): DecoyHit["kind"] {
  if (path === "/robots.txt") { return "robots"; }
  if (path === "/api/v1/auth/login") { return "fake-auth"; }
  if (path === "/trap/breach") { return "breach"; }
  if (path === "/report-security") {
    return gate.remaining < gate.limit - TARPIT_AFTER ? "report" : "bait";
  }

  return Object.hasOwn(BAIT_PAGES, path,) ? "bait" : "unknown";
}

/**
 * Match one literal deny rule against the request source.
 * @param rule
 * @param ip
 * @param userAgent
 */
function matchesDenyRule(
  rule: DecoyDenyRule,
  ip: string | null,
  userAgent: string | null,
): boolean {
  return (rule.ip !== undefined && rule.ip === ip) ||
    (rule.userAgent !== undefined && userAgent?.includes(rule.userAgent,) === true);
}

/**
 * Start the decoy listener. Call {@link DecoyListener.stop} on shutdown.
 * @param options - bind address, caps, and hit sink
 * @returns a handle with the concrete origin and a stop function
 */
export function startDecoyListener(options: DecoyListenerOptions = {},): DecoyListener {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const limiter: RateLimiter = createRateLimiter({
    maxRequests: options.maxRequestsPerWindow ?? DEFAULT_MAX_REQUESTS,
    windowMs: options.windowMs ?? DEFAULT_WINDOW_MS,
  },);

  const tarpitMs = Math.min(MAX_TARPIT_MS, Math.max(0, options.tarpitMs ?? 0,),);
  const maxConcurrentTarpits = Math.max(1, options.maxConcurrentTarpits ?? DEFAULT_MAX_CONCURRENT_TARPITS,);
  let inFlightTarpits = 0;

  /**
   * Slow repeated bait hits only. ponytail: one global concurrency cap plus a
   * 500 ms ceiling; add per-route budgets if measured load needs them.
   * @param kind
   * @param gate
   */
  async function tarpit(kind: DecoyHit["kind"], gate: RateLimitResult,): Promise<void> {
    if (tarpitMs <= 0 || kind === "robots" || kind === "unknown") { return; }
    if (gate.remaining >= gate.limit - TARPIT_AFTER || inFlightTarpits >= maxConcurrentTarpits) { return; }
    inFlightTarpits += 1;
    try {
      await Bun.sleep(tarpitMs,);
    } finally {
      inFlightTarpits -= 1;
    }
  }

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(
      request: Request,
      serve: { requestIP(request: Request,): { address: string } | null },
    ): Promise<Response> {
      const url = new URL(request.url,);
      const ip = serve.requestIP(request,)?.address ?? null;
      const denied = options.denyRules?.some((rule: DecoyDenyRule,) =>
        matchesDenyRule(rule, ip, request.headers.get("user-agent",),)
      );

      if (denied === true) {
        return reply("not found", 404, "text/plain; charset=utf-8",);
      }

      const bucket = `decoy:${ip ?? "unknown"}`;
      const gate = limiter.consume(bucket,);
      if (!gate.allowed) {
        const headers = rateLimitHeaders(gate, gate.resetSec,);
        return new Response("slow down", { status: 429, headers, },);
      }

      // ponytail: content-length only; a chunked sender can stream past this,
      // but the handler never reads the body, so no bytes are buffered here.
      const declared = Number(request.headers.get("content-length",) ?? "0",);
      if (Number.isFinite(declared,) && declared > maxBodyBytes) {
        return reply("too large", 413, "text/plain; charset=utf-8",);
      }

      const method = request.method.toUpperCase();
      const path = url.pathname;
      const kind = decoyKind(path, gate,);

      await tarpit(kind, gate,);

      options.onHit?.({ at: new Date().toISOString(), ip, kind, method, path, },);

      if (path === "/robots.txt") {
        return reply(ROBOTS, 200, "text/plain; charset=utf-8",);
      }

      if (method === "POST" && path === "/api/v1/auth/login") {
        const token = `llh_example_${crypto.randomUUID().replaceAll("-", "",)}`;
        return reply(
          jsonStringifyOr({
            authenticated: true,
            notice: "example-only token; not accepted by any service",
            role: "admin",
            token,
          },),
          200,
          "application/json; charset=utf-8",
        );
      }

      if ((method === "GET" || method === "HEAD") && Object.hasOwn(BAIT_PAGES, path,)) {
        return reply(BAIT_PAGES[path]!,);
      }

      return reply("not found", 404, "text/plain; charset=utf-8",);
    },
  },);

  return {
    url: `http://${host}:${server.port}`,
    async stop(): Promise<void> {
      limiter.destroy();
      await server.stop(true,);
    },
  };
}

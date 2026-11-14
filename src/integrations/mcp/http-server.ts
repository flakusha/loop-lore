// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 350

/**
 * src/integrations/mcp/http-server.ts — the MCP Streamable HTTP transport
 * (MCP spec 2025-06-18, "Streamable HTTP") over the facade op registry.
 *
 * The SDK owns the wire protocol: `WebStandardStreamableHTTPServerTransport`
 * answers the spec's HTTP rules (Accept negotiation, the Mcp-Session-Id
 * handshake, Origin/DNS-rebinding protection, MCP-Protocol-Version
 * validation, the GET SSE stream, DELETE termination). This module owns the
 * three things the SDK cannot: the AUTH seam, the facade context and the
 * session lifecycle.
 *
 * AUTH: every request must carry a credential the app's auth derive
 * resolved (an integration token or a user session). The principal is
 * SERVER-RESOLVED — the RPC body is protocol payload and can never assert
 * one. The facade context is minted exactly like the facade MCP route mints
 * it (createRequestContext -> facadeContextFromRequestContext).
 *
 * ONE ERROR ENVELOPE: every refusal THIS ENDPOINT produces is a JSON-RPC
 * error object (`{jsonrpc, id, error}`) — the shape the SDK transport
 * answers refusals with, so one client parser handles every error here.
 * (The app-wide auth guard's 401 and the CSRF plugin's 403 fire BEFORE this
 * route and keep the app envelope; they are not this endpoint's answer.)
 *
 * DNS REBINDING: the SDK's protection is ON and its allowlist comes from the
 * app's OWN configuration — the instance's public origin and the host it
 * binds — never from the request. A rebinding attack controls the Host
 * header too, so a host-relative check cannot stop it. An ABSENT Origin is
 * allowed: a non-browser MCP client sends none and its credential is not
 * ambient.
 *
 * SESSION SCOPING: a session pins the principal that opened it. Every later
 * request re-resolves the credential and must land on the SAME principal, so
 * a leaked session id cannot be replayed under another identity (403).
 *
 * SIZE: the live session set is BOUNDED by {@link MAX_LIVE_SESSIONS} and an
 * idle session is reaped after {@link SESSION_IDLE_TTL_MS}. Eviction takes the
 * CALLING principal's own oldest session, and a caller that owns none is
 * refused (503) rather than taking another principal's slot — one client can
 * never push another client out by merely connecting. The request body is read once, by
 * the SDK transport, and is bounded by the SDK's own body cap (4 MiB -> 413).
 */

import type { Server, } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport, } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Elysia, } from "elysia";
import { APP_VERSION, } from "../../config/constants";
import type { Config, } from "../../config/schema";
import { SERVER_DEFAULTS, } from "../../config/sections/server";
import { publicOriginOf, } from "../../federation/gossip";
import { getChildLogger, } from "../../logger";
import { createRequestContext, type PrincipalKind, } from "../../middleware/types";
import { requireUserId, } from "../../routes/http-utils";
import type { HandlerOpts, } from "../../routes/messages/types";
import { safeJsonStringify, } from "../../utils";
import { getFacadeRegistry, } from "../loop-lore-facade/instance";
import { buildMcpServer, } from "../loop-lore-facade/mcp/server";
import type { FacadeRouteCtx, } from "../loop-lore-facade/routes";
import { type FacadeContext, facadeContextFromRequestContext, } from "../loop-lore-facade/types";

/** The MCP endpoint, relative to the versioned prefix. */
const MCP_ENDPOINT = "integrations/mcp/streamable";

/**
 * Bun.serve's idle timeout: the app sets none (src/server/start.ts), so Bun's
 * 10s default applies and a quiet request is severed by the server.
 */
export const SERVER_IDLE_TIMEOUT_MS = 10_000;

/**
 * The GET SSE stream's keep-alive. It must beat the server's idle timeout or
 * the stream is severed before the first keep-alive frame — the repo's own
 * SSE convention (src/routes/harness/stream.ts).
 */
export const SSE_KEEP_ALIVE_MS = 8_000;

/**
 * A session idle for this long is reaped; the client re-initializes (the
 * spec's own recovery path). The repo's idle-TTL convention is 10 minutes
 * (the federation reservation TTL, the performance-quota idle TTL); an MCP
 * session keeps a live SSE stream, so it gets triple that.
 */
export const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

/**
 * Live sessions kept at once. The spec lets the server terminate a session at
 * any time ("The server MAY terminate the session at any time, after which it
 * MUST respond to requests containing that session ID with HTTP 404 Not
 * Found"), so the cap evicts a session instead of letting the map grow for
 * the process lifetime. A client that sees the 404 re-initializes, which is
 * the spec's own recovery path.
 */
export const MAX_LIVE_SESSIONS = 64;

/** The server-resolved identity a session is pinned to. */
interface McpPrincipal {
  readonly kind: PrincipalKind;
  readonly userId: string;
  readonly credentialId: string | null;
  readonly credentialScope: string | null;
}

/** One live session: the SDK transport plus the server bound to it. */
interface McpSession {
  readonly transport: WebStandardStreamableHTTPServerTransport;
  readonly server: Server;
  readonly principal: McpPrincipal;
  /** When the session was last used — the idle TTL is measured from here. */
  lastUsedAt: number;
  /** Release the transport's streams and the server graph behind the session. */
  close: () => Promise<void>;
}

/** The outcome of the auth boundary check. */
type AuthOutcome = { ok: true; principal: McpPrincipal } | { ok: false; refusal: Response };

/** The outcome of the session boundary check. */
type SessionOutcome = { ok: true; session: McpSession } | { ok: false; refusal: Response };

/** The outcome of making room for one more session. */
type RoomOutcome = { ok: true } | { ok: false; refusal: Response };

/** The context this plugin reads (the app's auth derive populates it). */
interface McpHttpCtx extends FacadeRouteCtx {
  request: Request;
}

/** Options this plugin accepts on top of the route handler options. */
export interface McpHttpOptions {
  /** The mount prefix of the MCP routes (production: "/api/v1"). */
  readonly prefix?: string;
  /** Clock for the session idle TTL (tests inject a controllable one). */
  readonly now?: () => number;
}

/** Structured log for this module (null until the app's logger is up). */
const getLog = () => getChildLogger("integrations.mcp.http",);

/**
 * A JSON-RPC error envelope — the same shape the SDK transport answers
 * refusals with, so one client parser handles every error on this endpoint.
 * @param status - HTTP status
 * @param code - JSON-RPC error code
 * @param message - human-readable reason
 * @returns the error response
 */
function rpcError(status: number, code: number, message: string,): Response {
  const serialized = safeJsonStringify({ jsonrpc: "2.0", id: null, error: { code, message, }, },);
  return new Response(serialized.ok ? serialized.value : "null", {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", },
  },);
}

/**
 * Mark a response as uncacheable. The initialize answer carries the session
 * id, so no cache may store it. The SDK's OWN directives are kept — its SSE
 * stream sends `no-cache, no-transform` and a proxy must not transform it.
 * @param response - the response to mark
 * @returns the same answer with `no-store` in its cache-control
 */
function noStore(response: Response,): Response {
  const headers = new Headers(response.headers,);
  const cacheControl = headers.get("cache-control",);

  // Not a template literal: the size gate's scanner mis-lexes a template tail
  // and then counts the rest of the file as code.
  headers.set("cache-control", cacheControl === null ? "no-store" : cacheControl.concat(", no-store",),);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  },);
}

/**
 * Normalize an origin to the form a browser sends (lowercase scheme and
 * host, no trailing slash, no default port).
 * @param origin - the origin to normalize
 * @returns the normalized origin, or null when the value is not an origin
 */
function normalizeOrigin(origin: string,): string | null {
  try {
    return new URL(origin,).origin;
  } catch {
    return null;
  }
}

/**
 * The DNS-rebinding allowlist, derived from the app's OWN configuration: the
 * instance's public origin (`server.publicOrigin`, else the bound host and
 * port) plus the host it binds. The request's Host header is NEVER the
 * allowlist — a rebinding attack controls it.
 * @param config - the app config
 * @returns the allowed origins and hosts
 */
function allowedTargets(config: Config | undefined,): { origins: string[]; hosts: string[] } {
  // A mount without a server section (a bare app) falls back to the app's
  // DEFAULT server config — never to the request's own Host header.
  const server = config?.server ?? SERVER_DEFAULTS;
  const { host, port, } = server;
  const origin = normalizeOrigin(publicOriginOf(server,),) ??
    normalizeOrigin(`http://${host}:${port}`,) ?? "";

  const hosts = new Set([
    ...(origin === "" ? [] : [new URL(origin,).host,]),
    host.toLowerCase(),
    `${host.toLowerCase()}:${port}`,
  ],);

  return { origins: origin === "" ? [] : [origin,], hosts: [...hosts,], };
}

/**
 * Whether a request's principal is the one the session was opened with.
 * @param session - the session's pinned principal
 * @param current - the principal this request resolved to
 * @returns true when both name the same identity
 */
function samePrincipal(session: McpPrincipal, current: McpPrincipal,): boolean {
  return session.kind === current.kind &&
    session.userId === current.userId &&
    session.credentialId === current.credentialId &&
    session.credentialScope === current.credentialScope;
}

/**
 * The least recently used session id of ONE principal.
 * @param sessions - the live session map
 * @param principal - the principal whose own sessions are considered
 * @returns the victim's session id, or undefined when the principal owns none
 */
function leastRecentlyUsedId(
  sessions: Map<string, McpSession>,
  principal: McpPrincipal,
): string | undefined {
  let foundId: string | undefined;
  let foundAt = Number.POSITIVE_INFINITY;
  for (const [id, session,] of sessions) {
    if (samePrincipal(session.principal, principal,) && session.lastUsedAt < foundAt) {
      foundId = id;
      foundAt = session.lastUsedAt;
    }
  }

  return foundId;
}

/**
 * Drop the sessions that have been idle past the TTL. Cheap and bounded: one
 * pass over the (capped) session map, no timers.
 * @param sessions - the live session map
 * @param now - the current time
 */
async function reapIdleSessions(sessions: Map<string, McpSession>, now: number,): Promise<void> {
  // Deleting the current entry while walking the map is safe (the Map
  // iterator skips the removed entry).
  for (const [id, session,] of sessions) {
    if (now - session.lastUsedAt <= SESSION_IDLE_TTL_MS) { continue; }
    sessions.delete(id,);
    await session.close();
    getLog()?.warn("reaped an idle MCP session", { sessionId: id, },);
  }
}

/**
 * Make room for one more session: reap the idle ones, then evict the CALLING
 * principal's own least recently used session. A caller that owns no session
 * never takes another principal's slot — it is refused instead; the server's
 * capacity is not another client's to take.
 * @param sessions - the live session map
 * @param principal - the principal opening the new session
 * @param now - the current time
 * @returns the outcome of making room
 */
async function makeRoom(
  sessions: Map<string, McpSession>,
  principal: McpPrincipal,
  now: number,
): Promise<RoomOutcome> {
  await reapIdleSessions(sessions, now,);
  while (sessions.size >= MAX_LIVE_SESSIONS) {
    const id = leastRecentlyUsedId(sessions, principal,);
    if (id === undefined) { return { ok: false, refusal: rpcError(503, -32000, "The session cap is reached",), }; }

    const session = sessions.get(id,);
    sessions.delete(id,);
    await session?.close();
    getLog()?.warn("evicted an MCP session at the live-session cap", { sessionId: id, },);
  }

  return { ok: true, };
}

/**
 * The MCP Streamable HTTP endpoint over the facade registry.
 *
 *  - `POST <prefix>/integrations/mcp/streamable` — JSON-RPC 2.0 (single or
 *    batch); the reply is `application/json` (the spec allows either that or
 *    an SSE stream);
 *  - `GET <prefix>/integrations/mcp/streamable` — the server->client SSE
 *    stream of an established session;
 *  - `DELETE <prefix>/integrations/mcp/streamable` — terminate a session.
 *
 * Mounts wherever sibling /api plugins do (v1 barrel), so the app-level auth
 * derive + guards run identically.
 * @param opts - HandlerOpts threaded like every other route plugin
 * @param options - plugin options (the mount prefix, the session clock)
 * @returns the Elysia plugin
 */
export function createMcpHttpRoutes(opts: HandlerOpts, options: McpHttpOptions = {},) {
  const { database, config, asyncStore, } = opts;
  const prefix = options.prefix ?? "/api";
  const now = options.now ?? Date.now;
  const targets = allowedTargets(config,);
  const sessions = new Map<string, McpSession>();
  const path = `${prefix}/${MCP_ENDPOINT}`;

  /**
   * BOUNDARY VALIDATION — every method of this endpoint runs it first: the
   * request must carry a credential the auth derive resolved. The spec's
   * DNS-rebinding rule is enforced by the SDK transport, whose allowlist is
   * the app's own configuration.
   * @param ctx - the request context
   * @returns the resolved principal, or the refusal to answer with
   */
  function authenticate(ctx: McpHttpCtx,): AuthOutcome {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") {
      return { ok: false, refusal: rpcError(401, -32000, "Unauthorized",), };
    }

    // Fail-closed seam: the auth derive ALWAYS resolves a kind on the
    // composed app; a mount that bypassed it has none. Reject rather than
    // default — there is no default principal to fall back to.
    if (ctx.principalKind === undefined) {
      return { ok: false, refusal: rpcError(401, -32000, "Unauthorized: no resolved principal",), };
    }

    return {
      ok: true,
      principal: {
        kind: ctx.principalKind,
        userId,
        credentialId: ctx.credentialId ?? null,
        credentialScope: ctx.credentialScope ?? null,
      },
    };
  }

  /**
   * Mint the facade context for a principal — the same seam the facade MCP
   * route uses, so the transport and the REST surface resolve identically.
   * @param ctx - the request context
   * @param principal - the server-resolved principal
   * @returns the facade context the ops run under
   */
  function facadeContext(ctx: McpHttpCtx, principal: McpPrincipal,): FacadeContext {
    const rc = createRequestContext({
      userId: principal.userId,
      userRole: ctx.userRole ?? null,
      sessionId: ctx.sessionId ?? null,
      // The resolved kind passes through verbatim — never defaulted.
      principalKind: principal.kind,
      credentialId: principal.credentialId,
      credentialName: ctx.credentialName ?? null,
      credentialScope: principal.credentialScope,
    },);

    return facadeContextFromRequestContext(
      { ...rc, requestId: typeof ctx.requestId === "string" ? ctx.requestId : "", },
      database,
      config,
      asyncStore,
    );
  }

  /**
   * SESSION VALIDATION — a request that names a session must name a live
   * one, opened by the same principal. A session idle past the TTL is
   * terminated and answers 404, like any unknown session id.
   * @param ctx - the request context
   * @param principal - the server-resolved principal
   * @returns the session, or the refusal to answer with
   */
  async function resolveSession(
    ctx: McpHttpCtx,
    principal: McpPrincipal,
  ): Promise<SessionOutcome> {
    const sessionId = ctx.request.headers.get("mcp-session-id",);
    if (sessionId === null) {
      return {
        ok: false,
        refusal: rpcError(400, -32000, "Bad Request: Mcp-Session-Id header is required",),
      };
    }

    const session = sessions.get(sessionId,);
    if (session === undefined) {
      return { ok: false, refusal: rpcError(404, -32001, "Session not found",), };
    }

    if (now() - session.lastUsedAt > SESSION_IDLE_TTL_MS) {
      sessions.delete(sessionId,);
      await session.close();
      getLog()?.warn("terminated an idle MCP session", { sessionId, },);
      return { ok: false, refusal: rpcError(404, -32001, "Session not found",), };
    }

    if (!samePrincipal(session.principal, principal,)) {
      return {
        ok: false,
        refusal: rpcError(403, -32000, "Forbidden: the session belongs to another principal",),
      };
    }

    session.lastUsedAt = now();
    return { ok: true, session, };
  }

  /**
   * Answer a request that names an established session — the GET SSE stream
   * and the DELETE termination.
   * @param ctx - the request context
   * @returns the transport's response
   */
  const sessionHandler = async (ctx: McpHttpCtx,): Promise<Response> => {
    const auth = authenticate(ctx,);
    if (!auth.ok) { return noStore(auth.refusal,); }

    const found = await resolveSession(ctx, auth.principal,);
    if (!found.ok) { return noStore(found.refusal,); }
    return noStore(await found.session.transport.handleRequest(ctx.request,),);
  };

  return new Elysia({ name: "loop-lore-mcp-http", },)
    .post(
      path,
      async (ctx: McpHttpCtx,) => {
        const auth = authenticate(ctx,);
        if (!auth.ok) { return noStore(auth.refusal,); }
        const principal = auth.principal;

        const sessionId = ctx.request.headers.get("mcp-session-id",);
        if (sessionId !== null) {
          const found = await resolveSession(ctx, principal,);
          if (!found.ok) { return noStore(found.refusal,); }
          return noStore(await found.session.transport.handleRequest(ctx.request,),);
        }

        // No session id: only an initialize request may open one. The
        // transport answers anything else with 400 ("Server not initialized").
        const room = await makeRoom(sessions, principal, now(),);
        if (!room.ok) { return noStore(room.refusal,); }

        const registry = getFacadeRegistry({ database, config, },);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
          // The spec's DNS-rebinding rule: the allowlist is the app's own
          // configuration, never the request's Host header.
          enableDnsRebindingProtection: true,
          allowedHosts: [...targets.hosts,],
          allowedOrigins: [...targets.origins,],
          // The keep-alive must beat the server's idle timeout.
          keepAliveMs: SSE_KEEP_ALIVE_MS,
          onsessioninitialized: (id,) => {
            sessions.set(id, {
              transport,
              server,
              principal,
              lastUsedAt: now(),
              // The transport's close() fires onsessionclosed, which deletes
              // the entry again (a no-op after an explicit delete).
              close: async () => {
                await transport.close();
                await server.close();
              },
            },);
          },
          onsessionclosed: (id,) => {
            sessions.delete(id,);
          },
        },);

        const server = buildMcpServer({
          registry,
          version: APP_VERSION,
          ctx: facadeContext(ctx, principal,),
        },);

        await server.connect(transport,);

        const response = await transport.handleRequest(ctx.request,);
        if (transport.sessionId === undefined) {
          // Not an initialize request — the transport refused it. Drop the
          // graph instead of parking a server nobody can reach.
          await server.close();
        }

        return noStore(response,);
      },
      { parse: "none", },
    )
    .get(path, sessionHandler,)
    .delete(path, sessionHandler,);
}

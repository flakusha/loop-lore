// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/integrations/mcp/http-server.ts — the MCP Streamable HTTP transport
 * (MCP spec 2025-06-18, "Streamable HTTP") over the facade op registry.
 *
 * The SDK owns the wire protocol: `WebStandardStreamableHTTPServerTransport`
 * answers the spec's HTTP rules (Accept negotiation, the Mcp-Session-Id
 * handshake, Origin/DNS-rebinding protection, MCP-Protocol-Version
 * validation, the GET SSE stream, DELETE termination). This module owns the
 * two things the SDK cannot: the AUTH seam and the facade context.
 *
 * AUTH: every request must carry a credential the app's auth derive
 * resolved (an integration token or a user session). The principal is
 * SERVER-RESOLVED — the RPC body is protocol payload and can never assert
 * one. The facade context is minted exactly like the facade MCP route mints
 * it (createRequestContext -> facadeContextFromRequestContext).
 *
 * SESSION SCOPING: a session pins the principal that opened it. Every later
 * request re-resolves the credential and must land on the SAME principal, so
 * a leaked session id cannot be replayed under another identity (403).
 */

import type { Server, } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport, } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Elysia, } from "elysia";
import { APP_VERSION, } from "../../config/constants";
import { createRequestContext, type PrincipalKind, } from "../../middleware/types";
import { ErrorCode, HttpStatus, jsonError, requireUserId, } from "../../routes/http-utils";
import type { HandlerOpts, } from "../../routes/messages/types";
import { safeJsonStringify, } from "../../utils";
import { getFacadeRegistry, } from "../loop-lore-facade/instance";
import { buildMcpServer, } from "../loop-lore-facade/mcp/server";
import type { FacadeRouteCtx, } from "../loop-lore-facade/routes";
import { type FacadeContext, facadeContextFromRequestContext, } from "../loop-lore-facade/types";

/** The MCP endpoint, relative to the versioned prefix. */
const MCP_ENDPOINT = "integrations/mcp/streamable";

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
}

/** The outcome of the auth boundary check. */
type AuthOutcome = { ok: true; principal: McpPrincipal } | { ok: false; refusal: Response };

/** The outcome of the session boundary check. */
type SessionOutcome = { ok: true; session: McpSession } | { ok: false; refusal: Response };

/** The context this plugin reads (the app's auth derive populates it). */
interface McpHttpCtx extends FacadeRouteCtx {
  request: Request;
}

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
    headers: { "content-type": "application/json", },
  },);
}

/**
 * DNS-rebinding guard (the spec's Origin rule). A browser sends `Origin` on
 * every request, so an Origin that does not belong to the host the request
 * reached is refused. Non-browser MCP clients send none — allowed, since the
 * credential in the Authorization header is not ambient.
 * @param request - the incoming request
 * @returns true when the Origin matches the request host (or is absent)
 */
function originAllowed(request: Request,): boolean {
  const origin = request.headers.get("origin",);
  if (origin === null) { return true; }
  const host = request.headers.get("host",);
  if (host === null) { return false; }
  try {
    return new URL(origin,).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
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
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin
 */
export function createMcpHttpRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, asyncStore, } = opts;
  const sessions = new Map<string, McpSession>();
  const path = `${prefix}/${MCP_ENDPOINT}`;

  /**
   * BOUNDARY VALIDATION — every method of this endpoint runs it first: the
   * request must carry a credential the auth derive resolved, and its
   * Origin must belong to the host the request reached (the spec's
   * DNS-rebinding rule).
   * @param ctx - the request context
   * @returns the resolved principal, or the refusal to answer with
   */
  function authenticate(ctx: McpHttpCtx,): AuthOutcome {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return { ok: false, refusal: userId, }; }

    // Fail-closed seam: the auth derive ALWAYS resolves a kind on the
    // composed app; a mount that bypassed it has none. Reject rather than
    // default — there is no default principal to fall back to.
    if (ctx.principalKind === undefined) {
      return {
        ok: false,
        refusal: jsonError({
          message: "Request reached the MCP transport without a resolved principal",
          status: HttpStatus.Unauthorized,
          code: ErrorCode.Unauthorized,
        },),
      };
    }

    if (!originAllowed(ctx.request,)) {
      return {
        ok: false,
        refusal: rpcError(403, -32000, "Forbidden: the Origin header does not match the request host",),
      };
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
   * one, opened by the same principal.
   * @param ctx - the request context
   * @param principal - the server-resolved principal
   * @returns the session, or the refusal to answer with
   */
  function resolveSession(
    ctx: McpHttpCtx,
    principal: McpPrincipal,
  ): SessionOutcome {
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

    if (!samePrincipal(session.principal, principal,)) {
      return {
        ok: false,
        refusal: rpcError(403, -32000, "Forbidden: the session belongs to another principal",),
      };
    }

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
    if (!auth.ok) { return auth.refusal; }

    const found = resolveSession(ctx, auth.principal,);
    if (!found.ok) { return found.refusal; }
    return await found.session.transport.handleRequest(ctx.request,);
  };

  return new Elysia({ name: "loop-lore-mcp-http", },)
    .post(
      path,
      async (ctx: McpHttpCtx,) => {
        const auth = authenticate(ctx,);
        if (!auth.ok) { return auth.refusal; }
        const principal = auth.principal;

        const sessionId = ctx.request.headers.get("mcp-session-id",);
        if (sessionId !== null) {
          const found = resolveSession(ctx, principal,);
          if (!found.ok) { return found.refusal; }
          return await found.session.transport.handleRequest(ctx.request,);
        }

        // No session id: only an initialize request may open one. The
        // transport answers anything else with 400 ("Server not initialized").
        const registry = getFacadeRegistry({ database, config, },);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (id,) => {
            sessions.set(id, { transport, server, principal, },);
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

        return response;
      },
      { parse: "none", },
    )
    .get(path, sessionHandler,)
    .delete(path, sessionHandler,);
}

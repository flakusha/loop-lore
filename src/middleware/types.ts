// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Middleware types — RequestContext + Middleware signature
 *
 * Context is populated by auth middleware, consumed by route handlers
 * and downstream middleware (role guards, ownership checks).
 */

import type { Locale, TranslatorFn, } from "../i18n/types";

export type PrincipalKind = "user" | "user-worktree" | "internal-service" | "external-agent";

export interface RequestContext {
  userId: string | null;
  userRole: string | null;
  sessionId: string | null;
  principalKind: PrincipalKind;
  locale: Locale;
  t: TranslatorFn;
  requestId: string;
}

export function createRequestContext(
  partial: Pick<RequestContext, "userId" | "userRole" | "sessionId"> & { principalKind?: PrincipalKind },
): RequestContext {
  return {
    ...partial,
    principalKind: partial.principalKind ?? "user",
    locale: "en",
    t: (key: string,) => key,
    requestId: "",
  };
}

export type Middleware = (
  request: Request,
  context: RequestContext,
  next: () => Promise<Response>,
) => Promise<Response>;

export type RouteHandler = (request: Request, context: RequestContext,) => Promise<Response> | Response;

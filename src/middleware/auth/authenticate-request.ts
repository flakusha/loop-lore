// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `authenticateRequest` — the ONE auth entry the app derive calls: the
 * integration-token seam first (an `llri_` bearer never enters the JWT
 * path), then the unchanged `authenticate()` derive. Sibling of
 * `authenticate` + `requireAuthGuard` per the ADR fail-closed seam rule:
 * a presented-but-invalid token is a 401, never a solo/guest downgrade.
 */
import { getChildLogger, } from "../../logger/index";
import { ErrorCode, HttpStatus, jsonError, } from "../../routes/http-utils";
import type { RequestContext, } from "../types";
import { authenticate, } from "./authenticate";
import {
  integrationTokenContext,
  type ResolvedIntegrationToken,
  resolveIntegrationTokenAuth,
} from "./integration-token";
import type { AuthenticateOpts, } from "./types";

/** Successful resolution: a context plus its credential (null = not token). */
export interface AuthResolution {
  readonly context: RequestContext;
  readonly credential: ResolvedIntegrationToken | null;
}

/**
 * Authenticate the request through the full chain: integration-token seam →
 * JWT `authenticate()`. Identical contract to `authenticate()` plus the
 * credential attribution on success.
 * @param opts - request, database, auth config (as `authenticate` takes)
 * @returns a 401 Response on failure, or the resolved context + credential
 */
export async function authenticateRequest(
  opts: AuthenticateOpts,
): Promise<Response | AuthResolution> {
  const tokenAuth = await resolveIntegrationTokenAuth(opts,);

  if (tokenAuth.kind === "resolved") {
    return { context: integrationTokenContext(tokenAuth.token,), credential: tokenAuth.token, };
  }

  if (tokenAuth.kind === "rejected") {
    // Fail-closed, mirroring the JWT presented-but-invalid rule: never the
    // solo identity, never a downgrade. Off-surface presentation is worded
    // distinctly so integrators learn the confinement instead of guessing.
    getChildLogger("auth.integration-token",)?.warn("integration token presented but refused", {
      reason: tokenAuth.reason,
    },);

    return jsonError({
      message: tokenAuth.reason === "off-surface"
        ? "Integration tokens are only valid on integration endpoints"
        : "Invalid, revoked, or expired integration token",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  }

  const result = await authenticate(opts,);
  if (result instanceof Response) { return result; }
  return { context: result.context, credential: null, };
}

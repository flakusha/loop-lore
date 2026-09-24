// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Build-identity endpoints — tamper-detection surface for federation.
 *
 * Public (always on, no opt-in):
 *   - `GET /.well-known/loop-lore/build-id`
 *     Returns { buildHash, gitHead, builtAt }. No secrets, no paths, no
 *     internal breakdown. Peers compare this against the hash they recompute
 *     from a clean checkout + lockfile + env (`bun run build:verify`).
 *
 * Admin (gated on admin.system capability, always on):
 *   - `GET /api/admin/build-id`
 *     Returns the full breakdown: sourceTreeHash + manifestHash + manifest.
 *     Used by sysadmins and the verify script for deep checks.
 *
 * Both endpoints are intentionally NOT gated by `config.federation.enabled`
 * — tamper detection is a baseline server-self-integrity surface; the
 * operator can put it behind auth if they want it private.
 */

import { Elysia, } from "elysia";
import { computeBuildIdentity, } from "../build/identity";
import { can, } from "../users/permissions";
import {
  ErrorCode,
  extractAuth,
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "./http-utils";

export interface BuildIdRouteOpts {
  /** Override the project root used for hashing. Defaults to process.cwd(). */
  projectRoot?: string;
}

export function buildIdRoutes(opts: BuildIdRouteOpts = {},): Elysia {
  const app = new Elysia({ name: "build-id", },);

  app.get("/.well-known/loop-lore/build-id", async () => {
    const id = await computeBuildIdentity({ projectRoot: opts.projectRoot, },);
    return jsonResponse({
      buildHash: id.buildHash,
      buildHashShort: id.buildHashShort,
      gitHead: id.gitHead,
      builtAt: id.builtAt,
    },);
  }, {
    detail: {
      summary: "Build identity (public)",
      description: "SHA-256 fingerprint over the running code (git HEAD + source + lockfile + manifest). " +
        "Peer-bootstrap surface for tamper detection. No secrets, no paths.",
      tags: ["Federation", "BuildId",],
    },
  },);

  app.get("/api/admin/build-id", async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const { userRole, } = extractAuth(ctx,);
    if (!can(userRole, "admin.system",)) {
      return jsonError({
        message: "Admin access required",
        status: HttpStatus.Forbidden,
        code: ErrorCode.Forbidden,
      },);
    }
    const id = await computeBuildIdentity({ projectRoot: opts.projectRoot, },);
    return jsonResponse({
      buildHash: id.buildHash,
      buildHashShort: id.buildHashShort,
      gitHead: id.gitHead,
      sourceTreeHash: id.sourceTreeHash,
      lockfileHash: id.lockfileHash,
      manifestHash: id.manifestHash,
      builtAt: id.builtAt,
      manifest: id.manifest,
    },);
  }, {
    detail: {
      summary: "Build identity (admin)",
      description: "Full build-identity breakdown including source-tree hash and manifest. " +
        "Gated on admin.system capability.",
      tags: ["Federation", "BuildId", "Admin",],
    },
  },);

  return app;
}

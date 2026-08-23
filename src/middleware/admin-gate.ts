// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin view guard — Elysia beforeHandle for /views/admin/*.
 *
 * Returns 302 redirect to "/" on denial (non-disruptive UX for page nav).
 * For API routes, use `requirePermission` from ./permissions.
 *
 * Usage: .guard({ beforeHandle: adminViewGuard }, (app) => app.get("/views/admin", ...))
 *
 * Accepts any Elysia context shape — userRole is injected via .derive() in elysia-app.ts.
 */
import { can, } from "../users/permissions";

export function adminViewGuard(ctx: any,): Response | undefined {
  if (!can(ctx.userRole, "admin.system",)) {
    return new Response(null, { status: 302, headers: { Location: "/", }, },);
  }
}

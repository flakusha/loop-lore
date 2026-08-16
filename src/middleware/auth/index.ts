// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auth middleware — JWT token verification.
 *
 * Original module split into domain modules; this barrel preserves the
 * public import surface (`auth` / `auth/index`).
 */
export { authenticate, } from "./authenticate";
export { getOrCreateSoloUserForAuth, resetSoloUserCache, } from "./solo-user";
export { extractBearerToken, resolveUserIdFromRequest, } from "./token";
export type { AuthenticateOpts, } from "./types";

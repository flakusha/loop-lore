// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin route validation schemas.
 */

import { t, } from "elysia";
import { OptionalId, } from "./primitives";

// ── Admin routes ───────────────────────────────────────────

export const ADMIN_ROLES = ["admin", "user", "viewer",] as const;

export const AdminRoleUpdateBody = t.Object({
  // Plain string + runtime check in the route: Elysia 1.4 compiles t.UnionEnum
  // with "default": <first member>, so an ABSENT role would be silently
  // replaced by "admin" instead of failing validation.
  role: t.String(),
},);
export const AdminSystemConfigBody = t.Object({
  key: t.String({ minLength: 1, },),
  value: t.String(),
  description: t.Optional(t.String(),),
},);

export const AdminModelRoleOverrideBody = t.Object({
  provider: t.String({ minLength: 1, },),
  model: t.String({ minLength: 1, },),
  temperature: t.Optional(t.Union([t.Number(), t.Null()],),),
  maxTokens: t.Optional(t.Union([t.Number(), t.Null()],),),
},);

export const AdminChatUpdateBody = t.Object({
  status: t.Optional(t.String(),),
  is_pinned: t.Optional(t.String(),),
  world_id: OptionalId,
},);

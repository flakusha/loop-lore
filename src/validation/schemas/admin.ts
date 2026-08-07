/**
 * Admin route validation schemas.
 */

import { t, } from "elysia";
import { OptionalId, } from "./primitives";

// ── Admin routes ───────────────────────────────────────────

export const AdminRoleUpdateBody = t.Object({
  role: t.UnionEnum(["admin", "user", "viewer",],),
},);

export const AdminSystemConfigBody = t.Object({
  key: t.String({ minLength: 1, },),
  value: t.String(),
  description: t.Optional(t.String(),),
},);

export const AdminModelRoleOverrideBody = t.Object({
  provider: t.String({ minLength: 1, },),
  model: t.String({ minLength: 1, },),
},);

export const AdminChatUpdateBody = t.Object({
  status: t.Optional(t.String(),),
  is_pinned: t.Optional(t.String(),),
  world_id: OptionalId,
},);

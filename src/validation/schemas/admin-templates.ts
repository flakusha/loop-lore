/**
 * Admin template route validation schemas.
 */

import { t, } from "elysia";

// ── Admin template schemas ────────────────────────────────

export const AdminTemplateCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  content: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
},);

export const AdminTemplateUpdateBody = t.Object({
  name: t.Optional(t.String(),),
  content: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
},);

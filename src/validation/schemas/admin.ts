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
/**
 * Body for POST /api/admin/system-config/import — accept a YAML/TOML payload
 * produced by the matching export endpoint. `format` selects the parser;
 * `content` is the raw file text (≤1MB enforced in the route).
 */
export const AdminSystemConfigImportBody = t.Object({
  format: t.Union([t.Literal("yaml"), t.Literal("toml")],),
  content: t.String({ maxLength: 1024 * 1024, },),
});

/**
 * Body for POST /api/v1/admin/setup/providers — an operator-entered provider
 * instance. `apiKey` is optional: omitting it on an update keeps the stored
 * (sealed) key. `allowedHosts` is the operator's explicit host approval; when
 * omitted the base URL's own host is approved.
 */
export const AdminSetupProviderBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 64, pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$", },),
  label: t.String({ minLength: 1, maxLength: 200, },),
  baseUrl: t.String({ minLength: 1, maxLength: 2048, },),
  model: t.String({ minLength: 1, maxLength: 200, },),
  apiKey: t.Optional(t.String({ maxLength: 4096, },),),
  allowedHosts: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 253, },),),),
  setDefault: t.Optional(t.Boolean(),),
},);

/** A stored provider instance — never carries key material. */
export const AdminServerProviderDescriptor = t.Object({
  name: t.String(),
  label: t.String(),
  baseUrl: t.String(),
  model: t.String(),
  allowedHosts: t.Array(t.String()),
  hasApiKey: t.Boolean(),
},);

/** Response body of GET /api/v1/admin/setup/providers. */
export const AdminSetupProvidersResponse = t.Object({
  providers: t.Array(AdminServerProviderDescriptor,),
  meta: t.Optional(t.Any(),),
},);

/** Response body of POST /api/v1/admin/setup/providers. */
export const AdminSetupProviderResponse = t.Object({
  ok: t.Boolean(),
  provider: AdminServerProviderDescriptor,
  meta: t.Optional(t.Any(),),
},);

export const AdminModelRoleOverrideBody = t.Object({
  provider: t.String({ minLength: 1, },),
  model: t.String({ minLength: 1, },),
  temperature: t.Optional(t.Union([t.Number(), t.Null()],),),
  maxTokens: t.Optional(t.Union([t.Number(), t.Null()],),),
},);

export const AdminChatUpdateBody = t.Object({
  status: t.Optional(t.String(),),
  is_pinned: t.Optional(t.Union([t.Literal("pinned"), t.Literal("unpinned"), t.Literal("archived"),],),),
  world_id: OptionalId,
},);

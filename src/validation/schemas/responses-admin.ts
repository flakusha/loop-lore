// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin API response-shape schemas (raw TypeBox).
 *
 * Admin list endpoints return a flat `{ data, total, page, pageSize }` envelope
 * via `jsonResponse` (NOT the `jsonPaginated` shape used by non-admin lists).
 * These schemas import only `@sinclair/typebox` so they are browser-bundleable
 * for the admin frontend components and valid in Elysia `response:` hooks.
 */

import { Type, type Static, type TSchema, } from "@sinclair/typebox";

/**
 * Flat admin-list envelope — `{ data, total, page, pageSize }`.
 */
export const AdminPaginatedEnvelope = <T extends TSchema,>(item: T,) =>
  Type.Object({
    data: Type.Array(item,),
    total: Type.Number(),
    page: Type.Number(),
    pageSize: Type.Number(),
  },);

/** Row shapes for the admin paginated list endpoints. */
export const AdminChatRow = Type.Object({
  id: Type.String(),
  name: Type.Union([Type.String(), Type.Null(),]),
  type: Type.String(),
  is_pinned: Type.String(),
  world_id: Type.Union([Type.String(), Type.Null(),]),
  created_at: Type.String(),
  updated_at: Type.String(),
},);
export type AdminChatRow = Static<typeof AdminChatRow>;
export const AdminUserRow = Type.Object({
  id: Type.String(),
  username: Type.String(),
  display_name: Type.Union([Type.String(), Type.Null(),]),
  role: Type.String(),
  status: Type.String(),
  created_at: Type.String(),
  last_seen_at: Type.Union([Type.String(), Type.Null(),]),
},);
export type AdminUserRow = Static<typeof AdminUserRow>;
export const AdminWorldRow = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null(),]),
  owner_id: Type.String(),
  created_at: Type.String(),
  updated_at: Type.String(),
},);
export type AdminWorldRow = Static<typeof AdminWorldRow>;
export const AdminAuditRow = Type.Object({
  id: Type.String(),
  level: Type.Number(),
  message: Type.String(),
  module: Type.Union([Type.String(), Type.Null(),]),
  event_type: Type.Union([Type.String(), Type.Null(),]),
  entity_type: Type.Union([Type.String(), Type.Null(),]),
  entity_id: Type.Union([Type.String(), Type.Null(),]),
  user_id: Type.Union([Type.String(), Type.Null(),]),
  session_id: Type.Union([Type.String(), Type.Null(),]),
  request_id: Type.Union([Type.String(), Type.Null(),]),
  meta: Type.Union([Type.String(), Type.Null(),]),
  action: Type.Union([Type.String(), Type.Null(),]),
  timestamp: Type.Union([Type.Number(), Type.Null(),]),
  time: Type.Union([Type.String(), Type.Null(),]),
  created_at: Type.String(),
},);

/** One template profile summary (admin-templates.ts). */
export const AdminTemplateProfile = Type.Object({
  id: Type.String(),
  name: Type.String(),
  families: Type.Array(Type.String(),),
  promptFormat: Type.String(),
  maxTokenHint: Type.Number(),
  defaults: Type.Object({
    cfgScale: Type.Number(),
    steps: Type.Number(),
    sampler: Type.String(),
    scheduler: Type.Optional(Type.String(),),
    clipSkip: Type.Optional(Type.Number(),),
  },),
  isBuiltin: Type.Boolean(),
  templateCount: Type.Number(),
},);
export type AdminTemplateProfile = Static<typeof AdminTemplateProfile>;

/** Response of GET /api/admin/templates — `{ profiles, defaultProfileId, counts }`. */
export const AdminTemplateListResponse = Type.Object({
  profiles: Type.Array(AdminTemplateProfile,),
  defaultProfileId: Type.String(),
  builtinCount: Type.Number(),
  customCount: Type.Number(),
},);
export type AdminTemplateListResponse = Static<typeof AdminTemplateListResponse>;
// Public alias: `ProfileSummary` is re-exported for consumers (e.g.
// admin-templates.ts) to keep the API name stable vs AdminTemplateProfile.
// eslint-disable-next-line sonarjs/redundant-type-aliases
export type ProfileSummary = AdminTemplateProfile;

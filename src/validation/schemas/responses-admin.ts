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
 * @param item - TypeBox schema for items in the `data` array
 * @returns TypeBox object schema for admin paginated responses.
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
/**
 *
 */
export type AdminChatRow = Static<typeof AdminChatRow>;

/**
 * Body of GET /api/admin/chats/:id — the full chat row plus roll-up fields.
 * Declares the stable admin-relevant subset; the handler spreads the raw
 * row, so undeclared columns (story_state, gm_config, ...) remain additive.
 * is_pinned is the stored text flag ("0"/"1"), not a boolean.
 */
export const AdminChatDetail = Type.Object({
  id: Type.String(),
  name: Type.String(),
  type: Type.String(),
  mode: Type.String(),
  created_by: Type.String(),
  world_id: Type.Union([Type.String(), Type.Null(),],),
  is_pinned: Type.String(),
  visibility: Type.String(),
  encryption_level: Type.String(),
  thinking_visibility: Type.String(),
  created_at: Type.String(),
  updated_at: Type.String(),
  messageCount: Type.Number(),
  participants: Type.Array(
    Type.Object({
      actor_id: Type.String(),
      role_in_chat: Type.String(),
      joined_at: Type.String(),
    },),
  ),
},);
/**
 *
 */
export type AdminChatDetail = Static<typeof AdminChatDetail>;
export const AdminUserRow = Type.Object({
  id: Type.String(),
  username: Type.String(),
  display_name: Type.Union([Type.String(), Type.Null(),]),
  role: Type.String(),
  status: Type.String(),
  created_at: Type.String(),
  last_seen_at: Type.Union([Type.String(), Type.Null(),]),
},);
/**
 *
 */
export type AdminUserRow = Static<typeof AdminUserRow>;
export const AdminWorldRow = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null(),]),
  owner_id: Type.String(),
  created_at: Type.String(),
  updated_at: Type.String(),
},);
/**
 *
 */
export type AdminWorldRow = Static<typeof AdminWorldRow>;

/**
 * Body of GET /api/admin/worlds/:id — the full world row plus a location
 * roll-up. Declares the stable admin-relevant subset; the handler spreads
 * the raw row, so undeclared columns (lore, rules, rpg_* knobs, ...)
 * remain additive. rpg_enabled is the stored numeric flag, not a boolean.
 */
export const AdminWorldDetail = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null(),]),
  owner_id: Type.String(),
  publication_status: Type.String(),
  kind: Type.String(),
  visibility: Type.String(),
  nsfw_override: Type.Union([Type.String(), Type.Null(),]),
  rpg_enabled: Type.Number(),
  created_at: Type.String(),
  updated_at: Type.String(),
  locationCount: Type.Number(),
},);
/**
 *
 */
export type AdminWorldDetail = Static<typeof AdminWorldDetail>;

/**
 * One `world_event_log` row (admin/world-events.ts). `payload` stays a
 * string: the log is an append-only record whose shape is owned by the
 * simulation that wrote it, so the admin surface reports it verbatim
 * rather than pretending to validate it.
 */
export const AdminWorldEventRow = Type.Object({
  id: Type.String(),
  world_id: Type.String(),
  event_type: Type.String(),
  subject_id: Type.Union([Type.String(), Type.Null(),]),
  actor_id: Type.Union([Type.String(), Type.Null(),]),
  payload: Type.String(),
  tick_index: Type.Number(),
  created_at: Type.String(),
},);
/**
 *
 */
export type AdminWorldEventRow = Static<typeof AdminWorldEventRow>;
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
/**
 *
 */
export type AdminAuditRow = Static<typeof AdminAuditRow>;

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
/**
 *
 */
export type AdminTemplateProfile = Static<typeof AdminTemplateProfile>;

/** Response of GET /api/admin/templates — `{ profiles, defaultProfileId, counts }`. */
export const AdminTemplateListResponse = Type.Object({
  profiles: Type.Array(AdminTemplateProfile,),
  defaultProfileId: Type.String(),
  builtinCount: Type.Number(),
  customCount: Type.Number(),
},);
/**
 *
 */
export type AdminTemplateListResponse = Static<typeof AdminTemplateListResponse>;
// Public alias: `ProfileSummary` is re-exported for consumers (e.g.
// admin-templates.ts) to keep the API name stable vs AdminTemplateProfile.
 
/**
 *
 */
export type ProfileSummary = AdminTemplateProfile;

// ── Provisioned resources (admin/resources.ts) ─────────────────────────
// Public views mirror the service-layer InferenceResource, StorageResource
// and BackupRecord shapes: no credential material. jsonResponse merges an
// additive `meta` field into object bodies, as it does for every schema here.

/** Quota ceiling on a provisioned inference endpoint. */
export const AdminResourceQuota = Type.Object({
  requestsPerMinute: Type.Number(),
  tokensPerMinute: Type.Optional(Type.Number(),),
},);
/** The quota ceiling as returned on a public resource view. */
export type AdminResourceQuota = Static<typeof AdminResourceQuota>;

/** One provisioned inference endpoint (no credential material). */
export const AdminInferenceResource = Type.Object({
  id: Type.String(),
  ownerId: Type.String(),
  kind: Type.Union([Type.Literal("llm",), Type.Literal("sd",), Type.Literal("comfyui",),],),
  provider: Type.String(),
  endpoint: Type.String(),
  quota: AdminResourceQuota,
  status: Type.String(),
},);
/** One provisioned inference endpoint as returned by the admin API. */
export type AdminInferenceResource = Static<typeof AdminInferenceResource>;

/** One provisioned storage endpoint (no credential material). */
export const AdminStorageResource = Type.Object({
  id: Type.String(),
  ownerId: Type.String(),
  kind: Type.Union([Type.Literal("s3",), Type.Literal("webdav",),],),
  endpoint: Type.String(),
  storageQuotaBytes: Type.Number(),
  status: Type.String(),
},);
/** One provisioned storage endpoint as returned by the admin API. */
export type AdminStorageResource = Static<typeof AdminStorageResource>;

/** One stored backup row (payload included; callers decide what to expose). */
export const AdminBackupRecord = Type.Object({
  id: Type.String(),
  resourceType: Type.String(),
  ownerId: Type.String(),
  contentHash: Type.String(),
  serverHash: Type.Union([Type.String(), Type.Null(),],),
  payload: Type.String(),
  version: Type.Number(),
  storageQuotaBytes: Type.Number(),
},);
/** One stored backup row as returned by the admin API. */
export type AdminBackupRecord = Static<typeof AdminBackupRecord>;

/** Why a provisioned resource cannot serve (the probe's failure reason). */
const UnavailableReason = Type.Union([
  Type.Literal("unknown",),
  Type.Literal("paused",),
  Type.Literal("revoked",),
  Type.Literal("exhausted",),
],);

/**
 * Dry-run probe bodies are polymorphic: a live resource returns its public
 * view, an unavailable one returns a reason plus a built-in fallback note.
 * Discriminated on `ok` so neither branch is silently narrowed.
 */
export const AdminInferenceProbeResponse = Type.Union([
  Type.Object({ ok: Type.Literal(true,), resource: AdminInferenceResource, },),
  Type.Object({ ok: Type.Literal(false,), reason: UnavailableReason, fallback: Type.String(), },),
],);
/** Inference dry-run probe result as returned by the admin API. */
export type AdminInferenceProbeResponse = Static<typeof AdminInferenceProbeResponse>;

/** Storage dry-run probe result — same discriminator, storage resource view. */
export const AdminStorageProbeResponse = Type.Union([
  Type.Object({ ok: Type.Literal(true,), resource: AdminStorageResource, },),
  Type.Object({ ok: Type.Literal(false,), reason: UnavailableReason, fallback: Type.String(), },),
],);
/** Storage dry-run probe result as returned by the admin API. */
export type AdminStorageProbeResponse = Static<typeof AdminStorageProbeResponse>;

/** Envelope of GET /api/admin/resources/inference. */
export const AdminInferenceListResponse = Type.Object({ resources: Type.Array(AdminInferenceResource,), },);
/** Envelope of POST /api/admin/resources/inference. */
export const AdminInferenceAddResponse = Type.Object({ resource: AdminInferenceResource, },);
/** Envelope of GET /api/admin/resources/storage. */
export const AdminStorageListResponse = Type.Object({ resources: Type.Array(AdminStorageResource,), },);
/** Envelope of POST /api/admin/resources/storage. */
export const AdminStorageAddResponse = Type.Object({ resource: AdminStorageResource, },);
/** Envelope of POST /api/admin/resources/backups. */
export const AdminBackupWriteResponse = Type.Object({ backup: AdminBackupRecord, },);
/** Success body of POST /api/admin/resources/backups/:id/verify. */
export const AdminBackupVerifyResponse = Type.Object({ ok: Type.Literal(true,), backup: AdminBackupRecord, },);

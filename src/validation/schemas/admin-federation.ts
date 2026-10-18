// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin federation route body + response schemas.
 *
 * Enums are declared as `t.String()` plus a runtime `Set` membership check in
 * the handler, NOT `t.UnionEnum`: Elysia 1.4 compiles `t.UnionEnum` with a
 * `"default"` of the first member, so an ABSENT field would be silently filled
 * with `chat` instead of failing validation — and an omitted workload class is
 * exactly the kind of input an admin route must refuse rather than guess. This
 * is the same reason `AdminRoleUpdateBody.role` is a plain string
 * (`./admin.ts:15`).
 *
 * `origin` carries an explicit length bound so a hostile megabyte-long origin is
 * rejected by the body schema before any handler logic — let alone any network
 * call — runs.
 */

import { t, } from "elysia";

/** Longest origin the panel may submit; a real origin is far shorter. */
export const ADMIN_FEDERATION_ORIGIN_MAX = 2048;

/** Longest shared token the panel may submit. */
export const ADMIN_FEDERATION_TOKEN_MAX = 512;

/** POST /api/admin/federation/peers — create a peer with its workload metadata. */
export const AdminFederationPeerBody = t.Object({
  origin: t.String({ minLength: 1, maxLength: ADMIN_FEDERATION_ORIGIN_MAX, },),
  displayName: t.Optional(t.Union([t.String({ maxLength: 256, },), t.Null(),],),),
  instanceKind: t.Optional(t.String(),),
  authMode: t.Optional(t.String(),),
  workloadTrust: t.Optional(t.Boolean(),),
  allowedWorkloadClasses: t.Optional(t.Array(t.String(),),),
  stickyEnabled: t.Optional(t.Boolean(),),
  /** Plaintext, write-only. Never echoed by any route. */
  sharedToken: t.Optional(t.Union([t.String({ maxLength: ADMIN_FEDERATION_TOKEN_MAX, },), t.Null(),],),),
},);

/** PATCH /api/admin/federation/peers/:origin/workload — trust + allowed classes. */
export const AdminFederationWorkloadBody = t.Object({
  workloadTrust: t.Optional(t.Boolean(),),
  allowedWorkloadClasses: t.Optional(t.Array(t.String(),),),
  stickyEnabled: t.Optional(t.Boolean(),),
},);

/** PUT /api/admin/federation/budgets — one (peer, class) budget cell. */
export const AdminFederationBudgetBody = t.Object({
  origin: t.String({ minLength: 1, maxLength: ADMIN_FEDERATION_ORIGIN_MAX, },),
  workloadClass: t.String({ minLength: 1, maxLength: 64, },),
  mode: t.String({ minLength: 1, maxLength: 32, },),
  maxConcurrency: t.Optional(t.Union([t.Number(), t.Null(),],),),
  maxQueueDepth: t.Optional(t.Union([t.Number(), t.Null(),],),),
  requestsPerMinute: t.Optional(t.Union([t.Number(), t.Null(),],),),
  tokensPerMinute: t.Optional(t.Union([t.Number(), t.Null(),],),),
},);

/** PUT /api/admin/federation/matrix — the whole per-class preference matrix. */
export const AdminFederationMatrixBody = t.Object({
  /** class -> ordered peer origins. An absent or empty row is local-only. */
  preferences: t.Optional(t.Record(t.String({ maxLength: 64, },), t.Array(t.String({ maxLength: ADMIN_FEDERATION_ORIGIN_MAX, },),),),),
},);

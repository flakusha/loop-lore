// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";

// ── Batch operations (gallery batch §7.7) ────────────────────────────────

/**
 * Body for `POST /api/assets/batch-download` and `POST /api/assets/batch-delete`:
 * the gallery's selected asset ids. Capped at the gallery page-size ceiling (200)
 * so a single request cannot zip or delete an unbounded set. The download route
 * additionally accepts an optional chat context (decrypts chat-encrypted assets
 * linked to that chat instead of skipping them) and a naming-mode override.
 */
export const AssetBatchIdsBody = t.Object({
  ids: t.Array(t.String(), { minItems: 1, maxItems: 200, },),
  chatId: t.Optional(t.String(),),
  naming: t.Optional(t.Union([
    t.Literal("raw",),
    t.Literal("datetime",),
    t.Literal("hash",),
    t.Literal("datetime-hash",),
  ],),),
},);

/**
 * Body for `POST /api/assets/download-all`: the gallery's current search/filter
 * set. Reuses the gallery grid visibility + linked-entity + tag filters, so the
 * zip holds exactly what the requester sees. Hard-capped at 500 assets per
 * request; the response carries `X-Download-Truncated: true` past the cap.
 */
export const AssetDownloadAllBody = t.Object({
  q: t.Optional(t.String(),),
  type: t.Optional(t.String(),),
  entityType: t.Optional(t.String(),),
  entityId: t.Optional(t.String(),),
  tag: t.Optional(t.String(),),
  chatId: t.Optional(t.String(),),
  naming: t.Optional(t.Union([
    t.Literal("raw",),
    t.Literal("datetime",),
    t.Literal("hash",),
    t.Literal("datetime-hash",),
  ],),),
},);

/**
 * Body for `PUT /api/assets/preferences`: the caller's download-naming
 * override. Null clears it back to the admin `assets.downloadNaming` default.
 */
export const AssetPreferencesBody = t.Object({
  downloadNaming: t.Union([
    t.Literal("raw",),
    t.Literal("datetime",),
    t.Literal("hash",),
    t.Literal("datetime-hash",),
    t.Null(),
  ],),
},);

/**
 * Response for `GET /api/assets/preferences` and `PUT /api/assets/preferences`:
 * the caller's override (null follows the admin default).
 */
export const AssetPreferencesResponse = t.Object({
  ok: t.Boolean(),
  downloadNaming: t.Union([
    t.Literal("raw",),
    t.Literal("datetime",),
    t.Literal("hash",),
    t.Literal("datetime-hash",),
    t.Null(),
  ],),
},);

/**
 * Response for `POST /api/assets/batch-delete`. Only ids actually deleted are
 * reported — unknown or not-owned ids are silently skipped so the response is
 * not an existence oracle on arbitrary asset ids.
 */
export const AssetBatchDeleteResponse = t.Object({
  ok: t.Boolean(),
  deleted: t.Array(t.String(),),
},);

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";

// ── Batch operations (gallery batch §7.7) ────────────────────────────────

/**
 * Body for `POST /api/assets/batch-download` and `POST /api/assets/batch-delete`:
 * the gallery's selected asset ids. Capped at the gallery page-size ceiling (200)
 * so a single request cannot zip or delete an unbounded set.
 */
export const AssetBatchIdsBody = t.Object({
  ids: t.Array(t.String(), { minItems: 1, maxItems: 200, },),
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

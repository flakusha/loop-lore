// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Service — CRUD dispatchers, re-export shim.
 *
 * The original monolithic `crud.ts` was split for size-strict
 * compliance. The split is:
 *
 *   crud-arc.ts      getArc, upsertArc + rowToArc
 *   crud-log.ts      getGrowthMode, insertGrowthLog, listGrowthLog + rowToGrowthEntry
 *   crud-confirm.ts  confirmGrowthEntry, rejectGrowthEntry + rowToGrowthEntry (own copy)
 *
 * This file re-exports all dispatchers so existing call sites
 * (`import { … } from "./crud"`) continue to compile without churn.
 * The `index.ts` service class wraps these dispatchers and is the
 * documented public surface for routes, prompt sections, and bridges.
 */
export { getArc, upsertArc, } from "./crud-arc";
export { confirmGrowthEntry, rejectGrowthEntry, } from "./crud-confirm";
export { getGrowthMode, insertGrowthLog, listGrowthLog, } from "./crud-log";

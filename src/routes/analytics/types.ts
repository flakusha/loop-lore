// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Context, } from "elysia";

/** Auth fields populated on the Elysia context by the global derive. */
export interface AnalyticsAuth {
  userId: string | null;
}

/** Elysia context augmented with the auth fields these handlers read. */
export type AnalyticsCtx = Context & AnalyticsAuth;

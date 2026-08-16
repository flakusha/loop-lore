// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * API keys route validation schemas.
 */

import { t, } from "elysia";

// ── API keys schemas ──────────────────────────────────────

export const ApiKeyCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  provider: t.String({ minLength: 1, },),
  api_key: t.String({ minLength: 1, },),
},);

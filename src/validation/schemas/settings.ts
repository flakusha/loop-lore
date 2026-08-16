// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Settings route validation schema.
 */

import { t, } from "elysia";

// ── Settings ───────────────────────────────────────────────

export const SettingsUpdateBody = t.Object({
  body: t.Any(),
},);

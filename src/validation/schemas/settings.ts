/**
 * Settings route validation schema.
 */

import { t, } from "elysia";

// ── Settings ───────────────────────────────────────────────

export const SettingsUpdateBody = t.Object({
  body: t.Any(),
},);

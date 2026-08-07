/**
 * Notifications route validation schemas.
 */

import { t, } from "elysia";

// ── Notifications schemas ─────────────────────────────────

export const NotificationPreferencesBody = t.Object({
  enabled: t.Optional(t.Record(t.String(), t.Boolean(),),),
  mutedWorlds: t.Optional(t.Array(t.String(),),),
},);

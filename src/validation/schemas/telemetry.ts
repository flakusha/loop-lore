// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Telemetry route validation schemas.
 */

import { t, } from "elysia";

// ── Telemetry schemas ─────────────────────────────────────

export const TelemetryEventBody = t.Object({
  type: t.String({ minLength: 1, },),
  sessionId: t.Optional(t.String(),),
  userId: t.Optional(t.String(),),
  chatId: t.Optional(t.String(),),
  data: t.Optional(t.Record(t.String(), t.Any(),),),
},);

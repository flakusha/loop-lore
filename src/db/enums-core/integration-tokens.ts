// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration token enums (ADR-credentials-issuer-model, admin-scoped slice).
 *
 * IntegrationTokenScope is THE credential tier vocabulary: it mirrors
 * `FacadeScope` (`src/integrations/loop-lore-facade/types.ts`) value-for-value —
 * "read" | "chat-write" — so the DB column and the facade tier check cannot
 * drift. A facade registry test pins the structural identity.
 */

// ── Integration token scope tier ─────────────────────────
export const IntegrationTokenScope = {
  Read: "read",
  ChatWrite: "chat-write",
} as const;
/** */
export type IntegrationTokenScope = (typeof IntegrationTokenScope)[keyof typeof IntegrationTokenScope];

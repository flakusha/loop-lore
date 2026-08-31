// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Relationship Types ────────────────────────────────────
export const RelationshipType = {
  Friend: "friend",
  Rival: "rival",
  Ally: "ally",
  Enemy: "enemy",
  Family: "family",
  Mentor: "mentor",
  Student: "student",
  Neutral: "neutral",
} as const;
/** */
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];

// ── Relationship Events ───────────────────────────────────
export const RelationshipEventType = {
  Met: "met",
  Helped: "helped",
  Betrayed: "betrayed",
  Fought: "fought",
  Traded: "traded",
  Trained: "trained",
  Saved: "saved",
  Abandoned: "abandoned",
  Gifted: "gifted",
  insulted: "insulted",
  Praised: "praised",
  Teamed: "teamed",
  Separated: "separated",
  Reconciled: "reconciled",
  Promised: "promised",
} as const;
/** */
export type RelationshipEventType = (typeof RelationshipEventType)[keyof typeof RelationshipEventType];

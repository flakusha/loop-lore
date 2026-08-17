// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── NPC Management UI Types ─────────────────────────────────

/** Disposition level toward the player */
export type NpcDisposition = "hostile" | "unfriendly" | "neutral" | "friendly" | "honored" | "revered" | "exalted";

/** Relationship type between two entities */
export type RelationshipType = "friend" | "rival" | "enemy" | "ally" | "mentor" | "subordinate" | "neutral";

/** NPC basic data */
export interface NpcData {
  id: string;
  name: string;
  role: string;
  location: string;
  disposition: NpcDisposition;
  dispositionScore: number;
  description: string;
  stats: NpcStat[];
  inventory: NpcInventoryItem[];
  schedule: NpcScheduleEntry[];
  factionId: string | null;
  portrait: string | null;
}

/** NPC stat entry */
export interface NpcStat {
  name: string;
  value: number;
}

/** NPC inventory item */
export interface NpcInventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
}

/** NPC schedule entry */
export interface NpcScheduleEntry {
  startTime: string;
  endTime: string;
  activity: string;
  location: string;
}

/** Relationship between two entities */
export interface NpcRelationship {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  type: RelationshipType;
  strength: number; // -100 to 100
  history: string[];
}

/** Faction data */
export interface NpcFaction {
  id: string;
  name: string;
  icon: string;
  description: string;
  standing: number; // -100 to 100
  disposition: NpcDisposition;
  tier: string;
  benefits: string[];
  quests: NpcFactionQuest[];
  members: NpcFactionMember[];
}

/** Faction quest */
export interface NpcFactionQuest {
  id: string;
  name: string;
  completed: boolean;
}

/** Faction member */
export interface NpcFactionMember {
  id: string;
  name: string;
  role: string;
}

/** Karma data */
export interface NpcKarma {
  overall: number; // -100 to 100
  categories: NpcKarmaCategory[];
  titles: string[];
}

/** Karma category */
export interface NpcKarmaCategory {
  name: string;
  value: number;
  label: string;
}

/** Standing tier definition */
export interface StandingTier {
  name: string;
  min: number;
  max: number;
  color: string;
}

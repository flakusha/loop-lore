// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { RelationshipType, } from "../../../db/enums-character/relationships";

// ── NPC Management UI Types ─────────────────────────────────

/** Disposition level toward the player */
export type NpcDisposition = "hostile" | "unfriendly" | "neutral" | "friendly" | "honored" | "revered" | "exalted";

/** Relationship type between two entities */
export type { RelationshipType, };

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

/** Actor entry for the relationships cast picker */
export interface ActorSummary {
  id: string;
  display_name: string;
}

/**
 * Relationship row as served by GET /api/v1/actors/:actorId/relationships
 * (camelCase service shape — see relationships-service/types.ts).
 */
export interface ActorRelationshipRow {
  id: string;
  actorId: string;
  targetActorId: string;
  worldId: string | null;
  relationshipType: RelationshipType;
  standing: number;
  trust: number;
  familiarity: number;
  isBidirectional: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Panel-rendered relationship row with names resolved */
export interface RelationshipDisplayRow {
  id: string;
  targetName: string;
  type: RelationshipType;
  standing: number;
  trust: number;
  familiarity: number;
  isBidirectional: boolean;
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

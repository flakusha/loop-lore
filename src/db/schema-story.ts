/**
 * DB Schema — Story Domain Tables
 *
 * Worlds, locations, story turns, quests, NPC/Location states,
 * items, and world-placed items.
 */
import type { Generated } from "kysely";
import type {
  DifficultyReroll,
  DifficultyState,
  ItemCategory,
  ItemRarity,
  ItemVisibility,
  LoreEntryStatus,
  LorePosition,
  MemoryType,
  QuestProgressStatus,
  QuestStatus,
  QuestType,
  StackableState,
  TurnStatus,
  TurnType,
} from "./enums";

// ── Worlds ──────────────────────────────────────────────────
export interface Worlds {
  id: Generated<string>;
  owner_id: string;
  name: string;
  description: string | null;
  lore: string | null;
  scan_depth: number | null;
  token_budget: number | null;
  difficulty_modifier: number;
  difficulty_reroll: DifficultyReroll;
  difficulty_state: DifficultyState;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Locations ───────────────────────────────────────────────
export interface Locations {
  id: Generated<string>;
  world_id: string;
  name: string;
  description: string | null;
  connections: string;
  parent_location_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Story Turns ─────────────────────────────────────────────
export interface StoryTurns {
  id: Generated<string>;
  chat_id: string;
  turn_number: number;
  actor_id: string;
  turn_type: TurnType;
  prompt_sent: string;
  response_received: string | null;
  quality_score: number | null;
  quality_details: string | null;
  regeneration_count: number;
  status: TurnStatus;
  gm_decision: string | null;
  world_events: string;
  quest_progress: string;
  started_at: Generated<string>;
  completed_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Quests ──────────────────────────────────────────────────
export interface Quests {
  id: Generated<string>;
  world_id: string;
  creator_id: string;
  name: string;
  description: string | null;
  type: QuestType;
  status: QuestStatus;
  priority: number;
  config: string;
  progress: number;
  target: number;
  start_time: string | null;
  deadline: string | null;
  time_location_id: string | null;
  rewards: string;
  narrative_hooks: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
  completed_at: string | null;
}

// ── Quest Progress ──────────────────────────────────────────
export interface QuestProgress {
  id: Generated<string>;
  quest_id: string;
  chat_id: string;
  progress: number;
  status: QuestProgressStatus;
  contributed_events: string;
  started_at: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
  completed_at: string | null;
}

// ── World States ────────────────────────────────────────────
export interface WorldStates {
  id: Generated<string>;
  world_id: string;
  snapshot: string;
  trigger_message_id: string | null;
  trigger_turn_id: string | null;
  description: string | null;
  created_at: Generated<string>;
}

// ── NPC Dynamic States ──────────────────────────────────────
export interface NpcStates {
  id: Generated<string>;
  actor_id: string;
  world_id: string;
  location_id: string | null;
  health: number;
  mental_state: string;
  knowledge: string;
  relationships: string;
  inventory: string;
  schedule: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Location Dynamic States ─────────────────────────────────
export interface LocationStates {
  id: Generated<string>;
  location_id: string;
  world_id: string;
  description_override: string | null;
  atmosphere: string | null;
  npcs_present: string;
  items_available: string;
  time_of_day: string | null;
  weather: string | null;
  hazards: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Items ───────────────────────────────────────────────────
export interface Items {
  id: Generated<string>;
  world_id: string;
  name: string;
  description: string | null;
  category: ItemCategory;
  rarity: ItemRarity;
  stackable: StackableState;
  max_stack: number;
  properties: string;
  value: number;
  weight: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── World Items ─────────────────────────────────────────────
export interface WorldItems {
  id: Generated<string>;
  world_id: string;
  item_id: string;
  location_id: string | null;
  owner_actor_id: string | null;
  quantity: number;
  visibility: ItemVisibility;
  spawn_condition: string | null;
  respawnable: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Actor Memories ─────────────────────────────────────────
export interface ActorMemories {
  id: Generated<string>;
  actor_id: string;
  source_chat_id: string | null;
  content: string;
  memory_type: MemoryType;
  confidence: number;
  importance: number;
  keywords: string;
  decay_rate: Generated<number>;
  strength: Generated<number>;
  expires_at: string | null;
  last_accessed_at: Generated<string | null>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Actor Lore Entries (character_book) ────────────────────
export interface ActorLoreEntries {
  id: Generated<string>;
  actor_id: string;
  name: string | null;
  content: string;
  keys: string;
  secondary_keys: string;
  selective: number;
  case_sensitive: number;
  enabled: LoreEntryStatus;
  constant: number;
  position: LorePosition;
  insertion_order: number;
  priority: number;
  comment: string | null;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── World Lore Entries ─────────────────────────────────────
export interface WorldLoreEntries {
  id: Generated<string>;
  world_id: string;
  name: string | null;
  content: string;
  keys: string;
  secondary_keys: string;
  selective: number;
  case_sensitive: number;
  enabled: LoreEntryStatus;
  constant: number;
  position: LorePosition;
  insertion_order: number;
  priority: number;
  comment: string | null;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

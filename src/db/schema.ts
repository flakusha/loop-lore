/**
 * DB Schema — Barrel
 *
 * All table type interfaces + DB aggregate for Kysely.
 * Domain-grouped sub-modules provide per-domain interfaces.
 */
export * from "./schema-core";
export * from "./schema-content";
export * from "./schema-generation";
export * from "./schema-story";
export * from "./schema-synthetic";

// ── DB Aggregate ────────────────────────────────────────────────────
export interface DB {
  users: import("./schema-core").Users;
  sessions: import("./schema-core").Sessions;
  chats: import("./schema-core").Chats;
  actors: import("./schema-core").Actors;
  chat_participants: import("./schema-core").ChatParticipants;
  characters: import("./schema-core").Characters;
  personas: import("./schema-core").Personas;
  messages: import("./schema-core").Messages;
  actor_keys: import("./schema-core").ActorKeys;
  assets: import("./schema-content").Assets;
  asset_links: import("./schema-content").AssetLinks;
  worlds: import("./schema-story").Worlds;
  locations: import("./schema-story").Locations;
  generation_attempts: import("./schema-generation").GenerationAttempts;
  story_turns: import("./schema-story").StoryTurns;
  quests: import("./schema-story").Quests;
  quest_progress: import("./schema-story").QuestProgress;
  world_states: import("./schema-story").WorldStates;
  npc_states: import("./schema-story").NpcStates;
  location_states: import("./schema-story").LocationStates;
  synthetic_data: import("./schema-synthetic").SyntheticData;
  user_api_keys: import("./schema-core").UserApiKeys;
  items: import("./schema-story").Items;
  world_items: import("./schema-story").WorldItems;
  actor_memories: import("./schema-story").ActorMemories;
  actor_lore_entries: import("./schema-story").ActorLoreEntries;
  world_lore_entries: import("./schema-story").WorldLoreEntries;
  actor_notes: import("./schema-core").ActorNotes;
  actor_items: import("./schema-core").ActorItems;
  model_role_overrides: import("./schema-core").ModelRoleOverrides;
}

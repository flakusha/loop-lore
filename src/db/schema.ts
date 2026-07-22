/**
 * DB Schema — Barrel
 *
 * All table type interfaces + DB aggregate for Kysely.
 * Domain-grouped sub-modules provide per-domain interfaces.
 */
export * from "./schema-content";
export * from "./schema-core";
export * from "./schema-generation";
export * from "./schema-story";
export * from "./schema-synthetic";
export * from "./schema-telemetry";

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
  message_translations: import("./schema-core").MessageTranslations;
  actor_keys: import("./schema-core").ActorKeys;
  group_initiatives: import("./schema-core").GroupInitiatives;
  chat_mentions: import("./schema-core").ChatMentions;
  notifications: import("./schema-core").Notifications;
  assets: import("./schema-content").Assets;
  asset_links: import("./schema-content").AssetLinks;
  asset_shares: import("./schema-content").AssetShares;
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
  system_config: import("./schema-core").SystemConfig;
  log_entries: import("./schema-core").LogEntries;
  plugin_state: import("./schema-core").PluginState;
  telemetry_events: import("./schema-telemetry").TelemetryEvents;
  message_reactions: import("./schema-core").MessageReactions;
  chat_pins: import("./schema-core").ChatPins;
}

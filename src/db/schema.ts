/**
 * DB Schema — Barrel
 *
 * All table type interfaces + DB aggregate for Kysely.
 * Domain-grouped sub-modules provide per-domain interfaces.
 */
export * from "./schema-character";
export * from "./schema-content";
export * from "./schema-core";
export * from "./schema-crafting";
export * from "./schema-generation";
export * from "./schema-moderation";
export * from "./schema-moderation";
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
  // Model comparisons (Q4)
  model_comparisons: import("./schema-core").ModelComparisons;
  // Character systems
  character_permanent_traits: import("./schema-character").CharacterPermanentTraits;
  character_world_traits: import("./schema-character").CharacterWorldTraits;
  character_location_traits: import("./schema-character").CharacterLocationTraits;
  character_mood: import("./schema-character").CharacterMood;
  mood_events: import("./schema-character").MoodEvents;
  character_relationships: import("./schema-character").CharacterRelationships;
  character_avatars: import("./schema-character").CharacterAvatars;
  character_avatar_config: import("./schema-character").CharacterAvatarConfig;
  world_avatar_config: import("./schema-character").WorldAvatarConfig;
  emotions: import("./schema-character").Emotions;
  character_emotions: import("./schema-character").CharacterEmotions;
  character_availability: import("./schema-character").CharacterAvailability;
  character_licensing: import("./schema-character").CharacterLicensing;
  admin_character_overrides: import("./schema-character").AdminCharacterOverrides;
  // NSFW systems
  character_intimacy: import("./schema-character").CharacterIntimacy;
  character_arousal: import("./schema-character").CharacterArousal;
  character_desire_profile: import("./schema-character").CharacterDesireProfile;
  character_seduction_skills: import("./schema-character").CharacterSeductionSkills;
  nsfw_encounters: import("./schema-character").NsfwEncounters;
  character_body_profile: import("./schema-character").CharacterBodyProfile;
  character_heat_cycle: import("./schema-character").CharacterHeatCycle;
  character_fantasies: import("./schema-character").CharacterFantasies;
  location_nsfw_config: import("./schema-character").LocationNsfwConfig;
  // NSFW Moderation
  nsfw_user_preferences: import("./schema-moderation").NsfwUserPreferences;
  moderation_actions: import("./schema-moderation").ModerationActions;
  content_flags: import("./schema-moderation").ContentFlags;
  moderation_appeals: import("./schema-moderation").ModerationAppeals;
  // Crafting systems
  crafting_recipes: import("./schema-crafting").CraftingRecipes;
  crafting_recipe_materials: import("./schema-crafting").CraftingRecipeMaterials;
  crafting_station_defs: import("./schema-crafting").CraftingStationDefs;
  crafting_station_instances: import("./schema-crafting").CraftingStationInstances;
  professions: import("./schema-crafting").Professions;
  profession_specializations: import("./schema-crafting").ProfessionSpecializations;
  recipe_discoveries: import("./schema-crafting").RecipeDiscoveries;
  gathering_node_defs: import("./schema-crafting").GatheringNodeDefs;
  gathering_node_materials: import("./schema-crafting").GatheringNodeMaterials;
  gathering_node_instances: import("./schema-crafting").GatheringNodeInstances;
  crafting_attempts: import("./schema-crafting").CraftingAttempts;
  crafting_orders: import("./schema-crafting").CraftingOrders;
}

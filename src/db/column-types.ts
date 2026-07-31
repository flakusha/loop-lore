/**
 * Column Type Overrides
 *
 * Maps table.column → TypeScript enum type.
 * Used by generate-db-types.ts to produce schema-*.ts interfaces.
 *
 * Only add entries for columns that use enum types from enums.ts.
 * Columns not listed here default to their SQLite type (text→string, integer→number, real→number).
 */

export const COLUMN_TYPE_OVERRIDES: Record<string, Record<string, string>> = {
  "ActorItems": {
    "equipped": "EquipState",
    "item_type": "ActorItemType",
  },
  "ActorKeys": {
    "key_type": "KeyType",
    "status": "KeyStatus",
  },
  "ActorLoreEntries": {
    "enabled": "LoreEntryStatus",
    "position": "LorePosition",
  },
  "ActorMemories": {
    "memory_type": "MemoryType",
  },
  "ActorNotes": {
    "category": "NoteCategory",
    "pinned": "PinnedState",
  },
  "Actors": {
    "actor_type": "ActorType",
    "agent_type": "AgentType",
  },
  "AdminCharacterOverrides": {
    "action": "AdminOverrideAction",
    "license_override": "LicenseType",
    "visibility_override": "VisibilityOverride",
  },
  "AssetLinks": {
    "entity_type": "AssetLinkEntity",
  },
  "Assets": {
    "asset_type": "AssetType",
    "storage_backend": "StorageBackend",
    "visibility": "AssetVisibility",
  },
  "CharacterFantasies": {
    "category": "FantasyCategory",
  },
  "CharacterLicensing": {
    "license_type": "LicenseType",
  },
  "CharacterPermanentTraits": {
    "trait_category": "TraitCategory",
  },
  "CharacterRelationships": {
    "relationship_type": "RelationshipType",
  },
  "Characters": {
    "agent_type": "AgentType",
  },
  "CharacterSeductionSkills": {
    "skill_category": "SeductionSkillCategory",
  },
  "CharacterWorldTraits": {
    "trait_category": "WorldTraitCategory",
  },
  "ChatParticipants": {
    "role_in_chat": "ChatParticipantRole",
  },
  "Chats": {
    "mode": "ChatMode",
    "turn_strategy": "TurnStrategy",
    "type": "ChatType",
  },
  "CraftingAttempts": {
    "status": "CraftingAttemptStatus",
  },
  "CraftingOrders": {
    "max_quality": "QualityLevel",
  },
  "CraftingRecipeMaterials": {
    "quality_requirement": "QualityLevel",
    "slot_type": "MaterialSlotType",
  },
  "CraftingRecipes": {
    "discipline": "CraftingDiscipline",
    "station_type_required": "CraftingStationType",
  },
  "CraftingStationDefs": {
    "station_type": "CraftingStationType",
  },
  "GatheringNodeDefs": {
    "node_type": "GatheringNodeType",
    "rarity": "QualityLevel",
  },
  "GatheringNodeMaterials": {
    "max_quality": "QualityLevel",
    "min_quality": "QualityLevel",
  },
  "GenerationAttempts": {
    "cancel_reason": "CancelReason",
    "cancel_source": "CancelSource",
    "status": "GenerationStatus",
  },
  "Items": {
    "category": "ItemCategory",
    "rarity": "ItemRarity",
    "stackable": "StackableState",
  },
  "LocationNsfwConfig": {
    "location_type": "NsfwLocationType",
  },
  "Messages": {
    "content_encoding": "ContentEncoding",
    "content_format": "MessageContentFormat",
    "content_type": "MessageContentType",
    "role": "MessageRole",
    "status": "MessageStatus",
    "visibility": "MessageVisibility",
  },
  "ModelRoleOverrides": {
    "role": "ModelRole",
  },
  "NsfwEncounters": {
    "encounter_type": "NsfwEncounterType",
    "intensity": "ContentIntensity",
    "narrative_style": "NarrativeStyle",
  },
  "Professions": {
    "discipline": "CraftingDiscipline",
    "title": "ProfessionTitle",
  },
  "ProfessionSpecializations": {
    "bonus_type": "ProfessionBonusType",
  },
  "QuestProgress": {
    "status": "QuestProgressStatus",
  },
  "Quests": {
    "status": "QuestStatus",
    "type": "QuestType",
  },
  "RecipeDiscoveries": {
    "discovery_method": "DiscoveryMethod",
  },
  "ShadowNotes": {
    "type": "ShadowNoteType",
  },
  "StoryTurns": {
    "status": "TurnStatus",
    "turn_type": "TurnType",
  },
  "SyntheticData": {
    "status": "SyntheticDataStatus",
    "type": "SyntheticDataType",
  },
  "Users": {
    "role": "UserRole",
    "status": "UserStatus",
  },
  "Whitenotes": {
    "scope": "WhiteneoteScope",
    "type": "WhiteneoteType",
  },
  "WorldAvatarConfig": {
    "selection_rule_override": "AvatarSelectionRule",
  },
  "WorldItems": {
    "visibility": "ItemVisibility",
  },
  "WorldLoreEntries": {
    "enabled": "LoreEntryStatus",
    "position": "LorePosition",
  },
  "Worlds": {
    "difficulty_reroll": "DifficultyReroll",
    "difficulty_state": "DifficultyState",
  },
};

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Column type overrides, part 2 (table.column -> enum type).
 *
 * Data only. Merged back into the single `COLUM2_TYPE_OVERRIDES` export in
 * ./column-types.ts, which is the only import surface.
 */

export const PART_2: Record<string, Record<string, string>> = {
  "InteractionLogs": {
    "category": "InteractionCategory",
    "outcome": "InteractionOutcome",
    "agency_mode": "AgencyMode",
  },
  "Items": {
    "category": "ItemCategory",
    "rarity": "ItemRarity",
    "stackable": "StackableState",
  },
  "LocationNsfwConfig": {
    "location_type": "NsfwLocationType",
  },
  "MeshPeers": {
    "instance_kind": "PeerInstanceKind",
    "auth_mode": "PeerAuthMode",
  },
  // 068_federation_performance_budgets
  "MeshWorkAssignments": {
    "workload_class": "PeerWorkloadClass",
  },
  "Messages": {
    "content_encoding": "ContentEncoding",
    "content_format": "MessageContentFormat",
    "content_type": "MessageContentType",
    "role": "MessageRole",
    "status": "MessageStatus",
    "visibility": "MessageVisibility",
  },
  "Notifications": {
    "read": "NotificationStatus",
  },
  "NsfwEncounters": {
    "encounter_type": "NsfwEncounterType",
    "intensity": "ContentIntensity",
    "narrative_style": "NarrativeStyle",
    "status": "NsfwEncounterStatus",
  },
  "NsfwUserPreferences": {
    "access_status": "NsfwAccessStatus",
  },
  "ModelRoleOverrides": {
    "role": "ModelRole",
  },
  "Professions": {
    "discipline": "CraftingDiscipline",
    "title": "ProfessionTitle",
  },
  "ProfessionSpecializations": {
    "bonus_type": "ProfessionBonusType",
  },
  "PlayerAchievements": {
    "status": "PlayerAchievementStatus",
  },
  "Playthroughs": {
    "status": "PlaythroughStatus",
  },
  "PluginState": {
    "status": "PluginStatus",
  },
  "QuestProgress": {
    "status": "QuestProgressStatus",
  },
  "Quests": {
    "category": "QuestCategory",
    "status": "QuestStatus",
    "type": "QuestType",
  },
  "RecipeDiscoveries": {
    "discovery_method": "DiscoveryMethod",
  },
  "ShadowNotes": {
    "author_type": "ShadowNoteAuthorType",
    "status": "ShadowNoteStatus",
    "type": "ShadowNoteType",
    "visibility": "ShadowNoteVisibility",
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
  "VnChoices": {
    "status": "VnChoiceStatus",
  },
  "WorldInvites": {
    "status": "InviteStatus",
  },
  "WorldItems": {
    "visibility": "ItemVisibility",
  },
  "WorldLoreEntries": {
    "enabled": "LoreEntryStatus",
    "position": "LorePosition",
    // 084: unified lore rarity tier (epic-lore-knowledge) — same canonical
    // ItemRarity scale items and loot use.
    "rarity": "ItemRarity",
  },
  "Worlds": {
    "difficulty_reroll": "DifficultyReroll",
    "difficulty_state": "DifficultyState",
    "kind": "WorldKind",
    "publication_status": "PublicationStatus",
    "visibility": "WorldVisibility",
  },
  "Locations": {
    "publication_status": "PublicationStatus",
    "kind": "LocationKind",
    "mobility_mode": "MobilityMode",
  },
  "LocationAnomalies": {
    "type": "AnomalyType",
    "interaction_required": "AnomalyInteraction",
  },
  "LocationEdges": {
    "mode": "LocationEdgeMode",
  },
  "EncounterTemplates": {
    "type": "EncounterType",
    "trigger_type": "EncounterTriggerType",
    "assistant_driven": "EncounterDrivingMode",
    "travel_phase": "EncounterTravelPhase",
    "active": "EncounterTemplateState",
  },
  "TravelRoutes": {
    "kind": "TransportKind",
  },
  // 061_npc_memory_bestiary
  "Factions": {
    "alignment": "FactionAlignment",
  },
  "FactionMemberships": {
    "role": "FactionRole",
  },
  "FactionRelationships": {
    "status": "FactionDiplomaticStatus",
  },
  "KarmaEvents": {
    "category": "KarmaCategory",
  },
  "WorldLicenses": {
    "spdx_or_custom": "LicenseKind",
  },
  "WorldMaps": {
    "map_type": "MapType",
  },
  "MapZones": {
    "zone_type": "ZoneType",
  },
  "NpcMemories": {
    "memory_type": "MemoryType",
  },
  "NpcRelationships": {
    "relationship_type": "NpcRelationshipType",
  },
  "MonsterTemplates": {
    "category": "MonsterCategory",
    "size": "MonsterSize",
    "alignment": "MonsterAlignment",
    "difficulty": "MonsterDifficulty",
  },
  "FederationPerformanceBudgets": {
    "workload_class": "PeerWorkloadClass",
    "budget_mode": "PeerBudgetMode",
  },
};

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Column type overrides, part 1 (table.column -> enum type).
 *
 * Data only. Merged back into the single `COLUM1_TYPE_OVERRIDES` export in
 * ./column-types.ts, which is the only import surface.
 */

export const PART_1: Record<string, Record<string, string>> = {
  "ActorItems": {
    "equipped": "EquipState",
    "item_type": "ItemCategory",
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
    "pinned": "PinnedState",
    "review_status": "MemoryReviewStatus",
    "extraction_kind": "ExtractionKind",
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
    "alpha_status": "AssetAlphaStatus",
    "storage_backend": "StorageBackend",
    "visibility": "AssetVisibility",
  },
  "AssetTransforms": {
    "context": "TransformContext",
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
  "CharacterSkills": {
    "lock_state": "SkillLockState",
  },
  "CharacterStats": {
    "character_state": "CharacterState",
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
  "ChatInvites": {
    "status": "InviteStatus",
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
  "GatheringNodeInstances": {
    "state": "NodeInstanceState",
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
  "PromptTemplates": {
    "modality": "TemplateModality",
    "detail_level": "TemplateDetailLevel",
    "is_default": "DefaultState",
    "enabled": "LoreEntryStatus",
  },
  "GenerationAttempts": {
    "cancel_reason": "CancelReason",
    "cancel_source": "CancelSource",
    "status": "GenerationStatus",
  },
};

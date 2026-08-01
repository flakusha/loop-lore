/**
 * DB Schema Enums — Barrel
 *
 * Single source of truth for all string-valued enum fields in the database.
 * Each enum is defined as a `const` object (runtime values) + a `type` union (compile-time).
 *
 * Re-exports from domain-grouped sub-modules.
 *
 * Usage:
 *   import { GenerationStatus } from "../db/enums";
 *   // Value: GenerationStatus.Pending  → "pending"
 *   // Type:  const x: GenerationStatus  → accepts only union members
 *
 * Enum-to-table mappings (for validation):
 *   enums-core: UserRole, UserStatus, ChatType, ChatMode, ChatPurpose, TurnStrategy,
 *               ActorType, AgentType, ChatParticipantRole, MessageRole, MessageContentType,
 *               MessageContentFormat, MessageStatus, MessageVisibility, ActorVisibility,
 *               PinnedState, DefaultState, EquipState, StackableState, KeyType, KeyStatus,
 *               NoteCategory, ActorItemType, ModelRole
 *   enums-content: ContentEncoding
 *   enums-generation: GenerationStatus, CancelReason, CancelSource, ChunkAction
 *   enums-story: TurnType, TurnStatus, QuestType, QuestStatus, QuestProgressStatus,
 *                SyntheticDataType, SyntheticDataStatus, SyntheticTestMode, WorldEventType,
 *                MemoryType, LorePosition, LoreEntryStatus, DifficultyReroll, DifficultyState,
 *                QualityDimension, ItemCategory, ItemRarity, ItemVisibility, PublicationStatus
 *   enums-config: DbType, LogLevel, AgeGateMode, GameMasterType, PolicyType, PolicyIndicatorType,
 *                 PolicySeverity, TransportProtocol, CompressionAlgorithm, TransportErrorCode,
 *                 ResponseCompression, EncryptionCompression, ImageApiFamily, SdModelType,
 *                 XFrameOption, CrossOriginOpenerPolicy, CrossOriginEmbedderPolicy,
 *                 CrossOriginResourcePolicy
 */
export * from "./enums-character";
export * from "./enums-config";
export * from "./enums-content";
export * from "./enums-core";
export * from "./enums-crafting";
export * from "./enums-generation";
export * from "./enums-gm";
export * from "./enums-story";
export * from "./state";

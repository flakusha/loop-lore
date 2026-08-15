/**
 * Primitive + enum validation schemas.
 *
 * Shared leaf schemas (ids, names, pagination, enums) plus generic
 * response helpers. No cross-dependencies — the base of the schema split.
 */

import { t, } from "elysia";

// ── Primitives ─────────────────────────────────────────────

export const Id = t.String({ format: "uuid", description: "UUID v4", },);
export const Name = t.String({ minLength: 1, maxLength: 255, description: "Entity name", },);
export const DisplayName = t.String({ minLength: 1, maxLength: 128, description: "Display name", },);
export const OptionalId = t.Optional(t.String({ format: "uuid", },),);
export const NullableId = t.Nullable(t.String({ format: "uuid", },),);

// ── Pagination ─────────────────────────────────────────────

export const PaginationQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50, },),),
},);

// ── Enums (mirrors src/db/enums-*.ts) ──────────────────────

export const ChatTypeSchema = t.UnionEnum(["direct", "group",],);
export const ChatModeSchema = t.UnionEnum(["direct", "group", "story",],);
export const ChatVisibilitySchema = t.UnionEnum(["private", "public", "unlisted",],);
export const TurnStrategySchema = t.UnionEnum([
  "round_robin",
  "scene_based",
  "initiative",
  "quest_driven",
  "hybrid",
],);

/** Chat-level GM configuration — stored as JSON in `chats.gm_config` */
/** Per-participant turn priority for GM-guided story guidance. */
export const GmTurnPrioritySchema = t.UnionEnum(["high", "medium", "low",],);

/** Narrative guidance a human Game Master applies to a story chat. */
export const GmGuidanceSchema = t.Object({
  constraints: t.Array(t.String(),),
  targetCharacter: t.Optional(t.String(),),
  sceneDescription: t.Optional(t.String(),),
  turnPriority: t.Record(t.String(), GmTurnPrioritySchema,),
},);

export const GmConfigSchema = t.Object({
  assistantRole: t.Optional(t.UnionEnum(["off", "helper", "gm", "moderator",],),),
  visualNovel: t.Optional(t.Boolean(),),
  storyMode: t.Optional(t.Boolean(),),
  gmGuidance: t.Optional(GmGuidanceSchema,),
  type: t.Optional(t.UnionEnum(["llm", "human", "hybrid",],),),
  humanGM: t.Optional(t.Object({ actorId: t.String(), notifications: t.Boolean(), },),),
  escalationThreshold: t.Optional(t.Number({ minimum: 0, maximum: 1, },),),
  llmConfig: t.Optional(
    t.Object({
      model: t.String(),
      provider: t.String(),
      systemPrompt: t.String(),
      temperature: t.Number(),
      maxTokens: t.Number(),
    },),
  ),
  actorModels: t.Optional(
    t.Record(t.String(), t.Object({ model: t.String(), provider: t.String(), },),),
  ),
},);

export const MessageRoleSchema = t.UnionEnum(["user", "assistant", "character", "system",],);
export const MessageContentTypeSchema = t.UnionEnum([
  "text",
  "action",
  "narration",
  "system",
  "continuation",
],);
export const MessageVisibilitySchema = t.UnionEnum([
  "visible",
  "hidden_by_user",
  "hidden_by_moderator",
  "auto_hidden",
  "redacted",
],);
export const MessageStatusSchema = t.UnionEnum([
  "sending",
  "confirmed",
  "failed",
  "partial",
  "rejected",
  "cancelled",
],);
export const ActorTypeSchema = t.UnionEnum(["user", "character", "narrator", "system",],);
export const AgentTypeSchema = t.UnionEnum(["none", "ai", "narrator", "npc",],);
export const UserRoleSchema = t.UnionEnum(["admin", "user", "viewer", "solo",],);
export const UserStatusSchema = t.UnionEnum(["active", "disabled", "deactivated",],);
export const ChatParticipantRoleSchema = t.UnionEnum(["member", "owner", "observer",],);
export const PinnedStateSchema = t.UnionEnum(["unpinned", "pinned", "archived",],);
export const ActorVisibilitySchema = t.UnionEnum(["private", "public",],);
export const WorldKindSchema = t.UnionEnum(["rpg", "chat",],);
export const WorldVisibilitySchema = t.UnionEnum(["public", "unlisted", "private",],);
export const ContentEncodingSchema = t.UnionEnum(["identity", "gzip", "zstd", "brotli",],);
export const AssetTypeSchema = t.UnionEnum(["image", "audio", "video", "memory", "other",],);
export const AssetVisibilitySchema = t.UnionEnum(["private", "shared", "public",],);
export const StorageBackendSchema = t.UnionEnum(["local", "s3", "gcs",],);
export const GenerationStatusSchema = t.UnionEnum([
  "pending",
  "processing",
  "streaming",
  "completed",
  "failed",
  "cancelled",
],);
export const WorldEventTypeSchema = t.UnionEnum([
  "location_change",
  "npc_state_change",
  "item_transfer",
  "time_advancement",
  "location_modification",
  "world_lore_update",
  "quest_progress",
  "combat_event",
],);
export const QuestTypeSchema = t.UnionEnum([
  "time",
  "collection",
  "destruction",
  "rescue",
  "discovery",
  "social",
  "composite",
],);
export const QuestStatusSchema = t.UnionEnum(["active", "completed", "failed", "abandoned",],);
export const QuestCategorySchema = t.UnionEnum(["main", "side", "bounty", "daily",],);
export const TurnTypeSchema = t.UnionEnum([
  "character_action",
  "narration",
  "gm_injection",
  "quest_update",
  "world_event",
],);
export const TurnStatusSchema = t.UnionEnum([
  "pending",
  "generating",
  "evaluating",
  "accepted",
  "regenerating",
  "failed",
  "escalated",
],);
export const MemoryTypeSchema = t.UnionEnum(["episodic", "semantic", "procedural",],);
export const NoteCategorySchema = t.UnionEnum([
  "general",
  "world",
  "character",
  "story",
  "combat",
  "session",
],);
export const ItemCategorySchema = t.UnionEnum([
  "weapon",
  "armor",
  "consumable",
  "key_item",
  "quest_item",
  "material",
  "tool",
  "container",
  "treasure",
  "book",
  "artifact",
  "misc",
  "other",
],);
export const ItemRaritySchema = t.UnionEnum(["common", "uncommon", "rare", "epic", "legendary", "unique", "artifact",],);

// ── Response schemas ──────────────────────────────────────

export const ErrorResponse = t.Object({
  error: t.String(),
  code: t.Optional(t.String(),),
  details: t.Optional(t.Any(),),
},);

export const SuccessResponse = t.Object({
  data: t.Any(),
},);

export function ListResponse(itemSchema: Parameters<typeof t.Array>[0],) {
  return t.Object({
    data: t.Array(itemSchema,),
    total: t.Number(),
    page: t.Number(),
    pageSize: t.Number(),
  },);
}

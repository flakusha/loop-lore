/**
 * Reusable Elysia validation schemas.
 *
 * Centralizes all `t.Object` definitions so route handlers
 * share a single source of truth for request validation.
 *
 * @module validation/schemas
 */

import { t } from "elysia";

// ── Primitives ─────────────────────────────────────────────

export const Id = t.String({ format: "uuid", description: "UUID v4" });
export const Name = t.String({ minLength: 1, maxLength: 255, description: "Entity name" });
export const DisplayName = t.String({ minLength: 1, maxLength: 128, description: "Display name" });
export const OptionalId = t.Optional(t.String({ format: "uuid" }));
export const NullableId = t.Nullable(t.String({ format: "uuid" }));

// ── Pagination ─────────────────────────────────────────────

export const PaginationQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50 })),
});

// ── Enums (mirrors src/db/enums-*.ts) ──────────────────────

export const ChatTypeSchema = t.UnionEnum(["direct", "group"]);
export const ChatModeSchema = t.UnionEnum(["direct", "group", "story"]);
export const TurnStrategySchema = t.UnionEnum([
  "round_robin",
  "scene_based",
  "initiative",
  "quest_driven",
  "hybrid",
]);
export const MessageRoleSchema = t.UnionEnum(["user", "assistant", "character", "system"]);
export const MessageContentTypeSchema = t.UnionEnum([
  "text",
  "action",
  "narration",
  "system",
  "continuation",
]);
export const MessageVisibilitySchema = t.UnionEnum([
  "visible",
  "hidden_by_user",
  "hidden_by_moderator",
  "auto_hidden",
  "redacted",
]);
export const MessageStatusSchema = t.UnionEnum([
  "sending",
  "confirmed",
  "failed",
  "partial",
  "rejected",
  "cancelled",
]);
export const ActorTypeSchema = t.UnionEnum(["user", "character", "narrator", "system"]);
export const AgentTypeSchema = t.UnionEnum(["none", "ai", "narrator", "npc"]);
export const UserRoleSchema = t.UnionEnum(["admin", "user", "viewer", "solo"]);
export const UserStatusSchema = t.UnionEnum(["active", "disabled", "deactivated"]);
export const ChatParticipantRoleSchema = t.UnionEnum(["member", "owner", "observer"]);
export const PinnedStateSchema = t.UnionEnum(["unpinned", "pinned", "archived"]);
export const ActorVisibilitySchema = t.UnionEnum(["private", "public"]);
export const ContentEncodingSchema = t.UnionEnum(["identity", "gzip", "zstd", "brotli"]);
export const AssetTypeSchema = t.UnionEnum(["image", "audio", "video", "memory", "other"]);
export const AssetVisibilitySchema = t.UnionEnum(["private", "shared", "public"]);
export const StorageBackendSchema = t.UnionEnum(["local", "s3", "gcs"]);
export const GenerationStatusSchema = t.UnionEnum([
  "pending",
  "processing",
  "streaming",
  "completed",
  "failed",
  "cancelled",
]);
export const WorldEventTypeSchema = t.UnionEnum([
  "location_change",
  "npc_state_change",
  "item_transfer",
  "time_advancement",
  "location_modification",
  "world_lore_update",
  "quest_progress",
  "combat_event",
]);
export const QuestTypeSchema = t.UnionEnum([
  "time",
  "collection",
  "destruction",
  "rescue",
  "discovery",
  "social",
  "composite",
]);
export const QuestStatusSchema = t.UnionEnum(["active", "completed", "failed", "abandoned"]);
export const TurnTypeSchema = t.UnionEnum([
  "character_action",
  "narration",
  "gm_injection",
  "quest_update",
  "world_event",
]);
export const TurnStatusSchema = t.UnionEnum([
  "pending",
  "generating",
  "evaluating",
  "accepted",
  "regenerating",
  "failed",
  "escalated",
]);
export const MemoryTypeSchema = t.UnionEnum(["episodic", "semantic", "procedural"]);
export const NoteCategorySchema = t.UnionEnum([
  "general",
  "world",
  "character",
  "story",
  "combat",
  "session",
]);
export const ActorItemTypeSchema = t.UnionEnum(["equipment", "consumable", "key_item", "artifact", "misc"]);
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
  "other",
]);
export const ItemRaritySchema = t.UnionEnum(["common", "uncommon", "rare", "epic", "legendary", "unique"]);
export const ModelRoleSchema = t.UnionEnum([
  "main",
  "captioning",
  "moderation",
  "embeddings",
  "summarization",
]);

// ── Chat routes ────────────────────────────────────────────

export const ChatCreateBody = t.Object({
  name: Name,
  type: t.Optional(ChatTypeSchema),
  mode: t.Optional(ChatModeSchema),
  turnStrategy: t.Optional(TurnStrategySchema),
  participantIds: t.Optional(t.Array(t.String())),
  worldId: OptionalId,
  currentLocationId: OptionalId,
});

export const ChatUpdateBody = t.Object({
  name: t.Optional(Name),
  mode: t.Optional(ChatModeSchema),
  turnStrategy: t.Optional(TurnStrategySchema),
  worldId: OptionalId,
  isPinned: t.Optional(t.Boolean()),
  isPaused: t.Optional(t.Boolean()),
});

export const ChatIdParams = t.Object({
  id: Id,
});

export const ChatParticipantParams = t.Object({
  id: Id,
  actorId: Id,
});

export const ChatParticipantUpdateBody = t.Object({
  talkativity: t.Optional(t.Numeric({ minimum: 1, maximum: 10 })),
  initiative: t.Optional(t.Numeric()),
  role: t.Optional(ChatParticipantRoleSchema),
});

export const ChatLocationUpdateBody = t.Object({
  locationId: NullableId,
});

export const ChatPersonaUpdateBody = t.Object({
  personaId: NullableId,
});

export const ChatImpersonateBody = t.Object({
  impersonateActorId: NullableId,
});

export const ChatMarkReadBody = t.Object({
  messageId: t.String({ minLength: 1 }),
});

export const BatchIdsBody = t.Object({
  ids: t.Array(t.String(), { minItems: 1 }),
});

// ── Message routes ─────────────────────────────────────────

export const MessageCreateBody = t.Object({
  content: t.String({ minLength: 1 }),
  parentId: OptionalId,
  role: t.Optional(MessageRoleSchema),
  contentType: t.Optional(MessageContentTypeSchema),
  idempotencyKey: t.Optional(t.String()),
  attachments: t.Optional(
    t.Array(
      t.Object({
        assetId: t.String(),
        order: t.Optional(t.Numeric()),
        caption: t.Optional(t.String()),
        label: t.Optional(t.String()),
      }),
    ),
  ),
});

export const MessageVisibilityUpdateBody = t.Object({
  visibility: MessageVisibilitySchema,
  reason: t.Optional(t.String()),
});

export const MessageStatusUpdateBody = t.Object({
  status: MessageStatusSchema,
});

export const MessageVariantBody = t.Object({
  variantIndex: t.Numeric({ minimum: 0 }),
});

export const MessageIdParams = t.Object({
  id: Id,
});

export const MessagesQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20 })),
  parentId: t.Optional(t.String()),
});

// ── Actor routes ───────────────────────────────────────────

export const ActorCreateBody = t.Object({
  displayName: DisplayName,
  actorType: t.Optional(ActorTypeSchema),
  agentType: t.Optional(AgentTypeSchema),
  description: t.Optional(t.String()),
  systemPrompt: t.Optional(t.String()),
});

export const ActorUpdateBody = t.Object({
  displayName: t.Optional(DisplayName),
  description: t.Optional(t.String()),
  systemPrompt: t.Optional(t.String()),
  avatarAssetId: OptionalId,
  personality: t.Optional(t.String()),
  welcomeMessage: t.Optional(t.String()),
  mesExample: t.Optional(t.String()),
  scenario: t.Optional(t.String()),
  postHistoryInstructions: t.Optional(t.String()),
  creatorNotes: t.Optional(t.String()),
  creator: t.Optional(t.String()),
  characterVersion: t.Optional(t.String()),
  settings: t.Optional(t.Any()),
});

export const ActorIdParams = t.Object({
  id: Id,
});

export const ActorsQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20 })),
  type: t.Optional(ActorTypeSchema),
});

// ── User routes ────────────────────────────────────────────

export const UserProfileUpdateBody = t.Object({
  displayName: t.Optional(DisplayName),
  birthDate: t.Optional(t.String()),
  settings: t.Optional(t.Any()),
});

export const UserIdParams = t.Object({
  id: Id,
});

// ── Admin routes ───────────────────────────────────────────

export const AdminRoleUpdateBody = t.Object({
  role: t.UnionEnum(["admin", "user", "viewer"]),
});

export const AdminSystemConfigBody = t.Object({
  key: t.String({ minLength: 1 }),
  value: t.String(),
  description: t.Optional(t.String()),
});

export const AdminModelRoleOverrideBody = t.Object({
  provider: t.String({ minLength: 1 }),
  model: t.String({ minLength: 1 }),
});

export const AdminChatUpdateBody = t.Object({
  status: t.Optional(t.String()),
  is_pinned: t.Optional(t.String()),
  world_id: OptionalId,
});

// ── World routes ───────────────────────────────────────────

export const WorldCreateBody = t.Object({
  name: Name,
  description: t.Optional(t.String()),
  locationCount: t.Optional(t.Numeric({ minimum: 0 })),
});

export const WorldUpdateBody = t.Object({
  name: t.Optional(Name),
  description: t.Optional(t.String()),
});

export const WorldIdParams = t.Object({
  id: Id,
});

// ── Entity routes (actor-items, memories, lore, notes) ─────

export const EntityCreateBody = t.Object({
  entityId: t.Optional(t.String({ minLength: 1 })),
  type: t.Optional(t.String()),
  name: t.Optional(Name),
  title: t.Optional(t.String()),
  content: t.Optional(t.String()),
  data: t.Optional(t.Any()),
});

export const EntityUpdateBody = t.Object({
  name: t.Optional(Name),
  content: t.Optional(t.String()),
  type: t.Optional(t.String()),
  data: t.Optional(t.Any()),
});

// ── Story / Quest routes ───────────────────────────────────

export const StoryTurnCreateBody = t.Object({
  type: TurnTypeSchema,
  content: t.String({ minLength: 1 }),
  actorId: OptionalId,
});

export const QuestCreateBody = t.Object({
  name: Name,
  type: t.Optional(QuestTypeSchema),
  description: t.Optional(t.String()),
});

// ── Login ──────────────────────────────────────────────────

export const LoginBody = t.Object({
  username: t.String({ minLength: 1 }),
  password: t.String({ minLength: 1 }),
});

// ── Settings ───────────────────────────────────────────────

export const SettingsUpdateBody = t.Object({
  body: t.Any(),
});

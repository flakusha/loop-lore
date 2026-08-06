/**
 * Reusable Elysia validation schemas.
 *
 * Centralizes all `t.Object` definitions so route handlers
 * share a single source of truth for request validation.
 *
 * @module validation/schemas
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
export const TurnStrategySchema = t.UnionEnum([
  "round_robin",
  "scene_based",
  "initiative",
  "quest_driven",
  "hybrid",
],);

/** Chat-level GM configuration — stored as JSON in `chats.gm_config` */
export const GmConfigSchema = t.Object({
  assistantRole: t.Optional(t.UnionEnum(["off", "helper", "gm", "moderator",],),),
  visualNovel: t.Optional(t.Boolean(),),
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
export const ActorItemTypeSchema = t.UnionEnum(["equipment", "consumable", "key_item", "artifact", "misc",],);
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
],);
export const ItemRaritySchema = t.UnionEnum(["common", "uncommon", "rare", "epic", "legendary", "unique",],);

// ── Chat routes ────────────────────────────────────────────

export const ChatCreateBody = t.Object({
  name: Name,
  type: t.Optional(ChatTypeSchema,),
  mode: t.Optional(ChatModeSchema,),
  turnStrategy: t.Optional(TurnStrategySchema,),
  participantIds: t.Optional(t.Array(t.String(),),), // eslint-disable-line unicorn/max-nested-calls
  worldId: OptionalId,
  currentLocationId: OptionalId,
  gmConfig: t.Optional(GmConfigSchema,),
  visualNovel: t.Optional(t.Boolean(),),
  templateId: t.Optional(t.String({ minLength: 1, },),),
  // Memory carry: seed the new chat with the participant character's
  // memories (full = all, selective = only memoryCarryIds, fresh = none).
  memoryCarry: t.Optional(t.Union([
    t.Literal("full",),
    t.Literal("selective",),
    t.Literal("fresh",),
  ],),),
  memoryCarryIds: t.Optional(t.Array(t.String(),),), // eslint-disable-line unicorn/max-nested-calls
},);

export const ChatUpdateBody = t.Object({
  name: t.Optional(Name,),
  mode: t.Optional(ChatModeSchema,),
  turnStrategy: t.Optional(TurnStrategySchema,),
  worldId: OptionalId,
  isPinned: t.Optional(t.Boolean(),),
  isPaused: t.Optional(t.Boolean(),),
  freezePanel: t.Optional(t.Boolean(),),
  gmConfig: t.Optional(GmConfigSchema,),
  visualNovel: t.Optional(t.Boolean(),),
},);

/**
 * A chat setup template — a validated preset that seeds a chat's key mechanics
 * at creation. `mode`, `turnStrategy`, `worldId`, `gmConfig`, `visualNovel` are
 * the immutable key mechanics once the bound chat goes online.
 */
export const ChatSetupTemplateSchema = t.Object({
  id: t.String({ minLength: 1, },),
  slug: t.String({ minLength: 1, },),
  name: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
  mode: t.Optional(ChatModeSchema,),
  turnStrategy: t.Optional(TurnStrategySchema,),
  worldId: OptionalId,
  gmConfig: t.Optional(GmConfigSchema,),
  visualNovel: t.Optional(t.Boolean(),),
},);

/** Body for creating a chat setup template (admin). */
export const ChatSetupTemplateCreateBody = t.Object({
  slug: t.String({ minLength: 1, },),
  name: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
  mode: t.Optional(ChatModeSchema,),
  turnStrategy: t.Optional(TurnStrategySchema,),
  worldId: OptionalId,
  gmConfig: t.Optional(GmConfigSchema,),
  visualNovel: t.Optional(t.Boolean(),),
},);

/** Body for updating a chat setup template (admin). */
export const ChatSetupTemplateUpdateBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, },),),
  description: t.Optional(t.String(),),
  mode: t.Optional(ChatModeSchema,),
  turnStrategy: t.Optional(TurnStrategySchema,),
  worldId: OptionalId,
  gmConfig: t.Optional(GmConfigSchema,),
  visualNovel: t.Optional(t.Boolean(),),
},);

/** Carry options for chat migration. */
export const ChatMigrateCarrySchema = t.Object({
  participants: t.Optional(t.Boolean(),),
  memory: t.Optional(t.Boolean(),),
  history: t.Optional(t.UnionEnum(["none", "summary", "full",],),),
  /** Carry party/game state: story_turns, quest_progress, group_initiatives. */
  state: t.Optional(t.Boolean(),),
  /** Carry chat pins + VN choice history. */
  pins: t.Optional(t.Boolean(),),
  /** Carry world/npc/location state snapshots for the party's world. */
  worldState: t.Optional(t.Boolean(),),
},);

/** Body for `POST /api/chats/:id/migrate` — fork to a new chat bound to a new template. */
export const ChatMigrateBody = t.Object({
  templateId: t.String({ minLength: 1, },),
  carry: t.Optional(ChatMigrateCarrySchema,),
  name: t.Optional(Name,),
},);

export const ChatIdParams = t.Object({
  id: Id,
},);

export const ChatRenameBody = t.Object({
  name: Name,
  name_source: t.Optional(t.String(),),
},);

export const ChatParticipantParams = t.Object({
  id: Id,
  actorId: Id,
},);

export const ChatParticipantUpdateBody = t.Object({
  talkativity: t.Optional(t.Numeric({ minimum: 1, maximum: 10, },),),
  initiative: t.Optional(t.Numeric(),),
  role: t.Optional(ChatParticipantRoleSchema,),
},);

export const ChatLocationUpdateBody = t.Object({
  locationId: NullableId,
},);

export const ChatPersonaUpdateBody = t.Object({
  personaId: NullableId,
},);

export const ChatImpersonateBody = t.Object({
  impersonateActorId: NullableId,
},);

export const ChatMarkReadBody = t.Object({
  messageId: t.String({ minLength: 1, },),
},);

export const BatchIdsBody = t.Object({
  ids: t.Array(t.String(), { minItems: 1, },),
},);

// ── Chat invite routes ─────────────────────────────────────

/** Body for POST /api/chats/:id/invites — create an invite. */
export const InviteCreateBody = t.Object({
  /** ISO timestamp after which the invite is invalid (null/omitted = never expires). */
  expiresAt: t.Optional(t.Nullable(t.String(),),),
  /** Max redemptions (null/omitted = unlimited). */
  maxUses: t.Optional(t.Nullable(t.Numeric({ minimum: 1, },),),),
},);

/** Invite response shape. */
export const InviteSchema = t.Object({
  id: t.String({ minLength: 1, },),
  chatId: t.String({ minLength: 1, },),
  code: t.String({ minLength: 1, },),
  createdBy: t.Nullable(t.String(),),
  createdAt: t.String({ minLength: 1, },),
  expiresAt: t.Nullable(t.String(),),
  maxUses: t.Nullable(t.Numeric(),),
  uses: t.Numeric(),
  revoked: t.Boolean(),
},);

/** Params for chat-scoped invite routes: POST/GET /api/chats/:id/invites. */
export const InviteChatParams = t.Object({
  id: Id,
},);

/** Params for invite-scoped routes: chat id + invite id. */
export const InviteParams = t.Object({
  id: Id,
  inviteId: Id,
},);

/** Params for POST /api/invites/:code/join. */
export const InviteJoinParams = t.Object({
  code: t.String({ minLength: 1, },),
},);

// ── World invite routes ────────────────────────────────────

/** World invite response shape (mirror of InviteSchema, world-scoped). */
export const WorldInviteSchema = t.Object({
  id: t.String({ minLength: 1, },),
  worldId: t.String({ minLength: 1, },),
  code: t.String({ minLength: 1, },),
  createdBy: t.Nullable(t.String(),),
  createdAt: t.String({ minLength: 1, },),
  expiresAt: t.Nullable(t.String(),),
  maxUses: t.Nullable(t.Numeric(),),
  uses: t.Numeric(),
  revoked: t.Boolean(),
},);

/** Params for world-scoped invite routes: world id + invite id. */
export const WorldInviteParams = t.Object({
  worldId: Id,
  inviteId: Id,
},);

// ── Message routes ─────────────────────────────────────────

export const MessageCreateBody = t.Object({
  content: t.String({ minLength: 1, },),
  parentId: OptionalId,
  role: t.Optional(MessageRoleSchema,),
  contentType: t.Optional(MessageContentTypeSchema,),
  idempotencyKey: t.Optional(t.String(),),
  attachments: t.Optional(
    t.Array(
      /* eslint-disable unicorn/max-nested-calls */
      t.Object({
        assetId: t.String(),
        order: t.Optional(t.Numeric(),),
        caption: t.Optional(t.String(),),
        label: t.Optional(t.String(),),
      },),
      /* eslint-enable unicorn/max-nested-calls */
    ),
  ),
},);

export const MessageVisibilityUpdateBody = t.Object({
  visibility: MessageVisibilitySchema,
  reason: t.Optional(t.String(),),
},);

export const MessageStatusUpdateBody = t.Object({
  status: MessageStatusSchema,
},);

export const MessageVariantBody = t.Object({
  variantIndex: t.Numeric({ minimum: 0, },),
},);

export const MessageIdParams = t.Object({
  id: Id,
},);

export const MessagesQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20, },),),
  parentId: t.Optional(t.String(),),
},);

// ── Actor routes ───────────────────────────────────────────

export const ActorCreateBody = t.Object({
  displayName: DisplayName,
  actorType: t.Optional(ActorTypeSchema,),
  agentType: t.Optional(AgentTypeSchema,),
  description: t.Optional(t.String(),),
  systemPrompt: t.Optional(t.String(),),
},);

export const ActorUpdateBody = t.Object({
  displayName: t.Optional(DisplayName,),
  description: t.Optional(t.String(),),
  systemPrompt: t.Optional(t.String(),),
  avatarAssetId: OptionalId,
  personality: t.Optional(t.String(),),
  welcomeMessage: t.Optional(t.String(),),
  mesExample: t.Optional(t.String(),),
  scenario: t.Optional(t.String(),),
  postHistoryInstructions: t.Optional(t.String(),),
  creatorNotes: t.Optional(t.String(),),
  creator: t.Optional(t.String(),),
  characterVersion: t.Optional(t.String(),),
  settings: t.Optional(t.Any(),),
},);

export const ActorIdParams = t.Object({
  actorId: Id,
},);

export const ActorsQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20, },),),
  type: t.Optional(ActorTypeSchema,),
},);

// ── User routes ────────────────────────────────────────────

export const UserProfileUpdateBody = t.Object({
  displayName: t.Optional(DisplayName,),
  birthDate: t.Optional(t.String(),),
  settings: t.Optional(t.Any(),),
},);

export const UserIdParams = t.Object({
  id: Id,
},);

// ── Admin routes ───────────────────────────────────────────

export const AdminRoleUpdateBody = t.Object({
  role: t.UnionEnum(["admin", "user", "viewer",],),
},);

export const AdminSystemConfigBody = t.Object({
  key: t.String({ minLength: 1, },),
  value: t.String(),
  description: t.Optional(t.String(),),
},);

export const AdminModelRoleOverrideBody = t.Object({
  provider: t.String({ minLength: 1, },),
  model: t.String({ minLength: 1, },),
},);

export const AdminChatUpdateBody = t.Object({
  status: t.Optional(t.String(),),
  is_pinned: t.Optional(t.String(),),
  world_id: OptionalId,
},);

// ── World routes ───────────────────────────────────────────

export const WorldCreateBody = t.Object({
  name: Name,
  description: t.Optional(t.String(),),
  locationCount: t.Optional(t.Numeric({ minimum: 0, },),),
  kind: t.Optional(WorldKindSchema,),
  visibility: t.Optional(WorldVisibilitySchema,),
},);

export const WorldUpdateBody = t.Object({
  name: t.Optional(Name,),
  description: t.Optional(t.String(),),
  kind: t.Optional(WorldKindSchema,),
  visibility: t.Optional(WorldVisibilitySchema,),
},);

export const WorldIdParams = t.Object({
  id: Id,
},);

// ── Entity routes (actor-items, memories, lore, notes) ─────

export const EntityCreateBody = t.Object({
  entityId: t.Optional(t.String({ minLength: 1, },),),
  type: t.Optional(t.String(),),
  name: t.Optional(Name,),
  title: t.Optional(t.String(),),
  content: t.Optional(t.String(),),
  data: t.Optional(t.Any(),),
},);

export const EntityUpdateBody = t.Object({
  name: t.Optional(Name,),
  content: t.Optional(t.String(),),
  type: t.Optional(t.String(),),
  data: t.Optional(t.Any(),),
},);

// ── Story / Quest routes ───────────────────────────────────

export const StoryTurnCreateBody = t.Object({
  type: TurnTypeSchema,
  content: t.String({ minLength: 1, },),
  actorId: OptionalId,
},);

export const QuestCreateBody = t.Object({
  name: Name,
  type: t.Optional(QuestTypeSchema,),
  description: t.Optional(t.String(),),
},);

// ── Login ──────────────────────────────────────────────────

export const LoginBody = t.Object({
  username: t.String({ minLength: 1, },),
  password: t.String({ minLength: 1, },),
},);

// ── Settings ───────────────────────────────────────────────

export const SettingsUpdateBody = t.Object({
  body: t.Any(),
},);

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

// ── Blog schemas ──────────────────────────────────────────

export const BlogPostCreateBody = t.Object({
  title: t.String({ minLength: 1, },),
  body: t.String({ minLength: 1, },),
  visibility: t.Optional(t.String(),),
  category: t.Optional(t.String(),),
  world_id: t.Optional(t.String({ format: "uuid", },),),
  character_id: t.Optional(t.String({ format: "uuid", },),),
},);

export const BlogPostUpdateBody = t.Object({
  title: t.Optional(t.String(),),
  body: t.Optional(t.String(),),
  visibility: t.Optional(t.String(),),
  category: t.Optional(t.String(),),
  status: t.Optional(t.String(),),
},);

export const BlogPostStatusBody = t.Object({
  status: t.String(),
},);

export const BlogCommentCreateBody = t.Object({
  body: t.String({ minLength: 1, },),
},);

export const BlogPostResponse = t.Object({
  id: t.String({ format: "uuid", },),
  title: t.String(),
  body: t.String(),
  author_id: t.String(),
  status: t.String(),
  visibility: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
},);

export const BlogCommentResponse = t.Object({
  id: t.String({ format: "uuid", },),
  post_id: t.String(),
  author_id: t.String(),
  body: t.String(),
  status: t.String(),
  created_at: t.String(),
},);

// ── Character systems schemas ─────────────────────────────

export const AdminOverrideCreateBody = t.Object({
  actor_id: t.String({ format: "uuid", },),
  action: t.String(),
  visibility_override: t.Optional(t.String(),),
  license_override: t.Optional(t.String(),),
  notes: t.Optional(t.String(),),
},);

export const MoodCreateBody = t.Object({
  happiness: t.Optional(t.Number({ minimum: 0, maximum: 100, },),),
  expression: t.Optional(t.String(),),
  baseMood: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
  moodStability: t.Optional(t.Number(),),
},);

export const MoodUpdateBody = t.Object({
  happiness: t.Optional(t.Number({ minimum: 0, maximum: 100, },),),
  expression: t.Optional(t.String(),),
  currentMood: t.Optional(t.String(),),
  moodStability: t.Optional(t.Number(),),
  worldId: t.Optional(t.String(),),
  expressionModifiers: t.Optional(t.Record(t.String(), t.Number(),),),
},);

export const MoodDeltaBody = t.Object({
  delta: t.Number(),
  reason: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
},);

export const MoodEventBody = t.Object({
  eventType: t.String(),
  intensity: t.Optional(t.Number(),),
  details: t.Optional(t.String(),),
  source: t.Optional(t.String(),),
  sourceId: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
  happinessDelta: t.Optional(t.Number(),),
  moodOverride: t.Optional(t.String(),),
},);

export const MoodStateResponse = t.Object({
  id: t.String(),
  actorId: t.String(),
  worldId: t.Nullable(t.String(),),
  happiness: t.Number(),
  baseMood: t.String(),
  currentMood: t.String(),
  moodStability: t.Number(),
  expressionModifiers: t.Record(t.String(), t.Number(),),
  lastMoodChange: t.String(),
},);

// Type aliases for backward compatibility
export type MoodCreateInput = typeof MoodCreateBody.static;
export type MoodUpdateInput = typeof MoodUpdateBody.static;
export type MoodEventInput = typeof MoodEventBody.static;

export const TraitCreateBody = t.Object({
  trait_category: t.String(),
  trait_name: t.String({ minLength: 1, },),
  value: t.Any(),
},);
export type TraitCreateInput = { category: string; name: string; value: string };

export const TraitUpdateBody = t.Object({
  value: t.Any(),
},);
export type TraitUpdateInput = { name: string; value: string };

export const WorldTraitCreateBody = t.Object({
  trait_category: t.String(),
  trait_name: t.String({ minLength: 1, },),
  value: t.Any(),
  world_id: t.String({ format: "uuid", },),
},);
export type WorldTraitCreateInput = { category: string; name: string; value: string; worldId: string };

export const LocationTraitCreateBody = t.Object({
  trait_category: t.String(),
  trait_name: t.String({ minLength: 1, },),
  value: t.Any(),
  location_id: t.String({ format: "uuid", },),
},);
export type LocationTraitCreateInput = {
  category: string;
  name: string;
  value: string;
  locationId: string;
  bonus?: number;
  penalty?: number;
  effects?: string;
};

export const LocationTraitUpdateBody = t.Object({
  value: t.Any(),
},);
export type LocationTraitUpdateInput = {
  name: string;
  value: string;
  bonus?: number;
  penalty?: number;
  effects?: string;
};

export const TraitResponse = t.Object({
  id: t.String({ format: "uuid", },),
  actor_id: t.String(),
  trait_category: t.String(),
  trait_name: t.String(),
  value: t.Any(),
  created_at: t.String(),
},);

export const RelationshipCreateBody = t.Object({
  target_actor_id: t.String({ format: "uuid", },),
  relationship_type: t.String(),
  strength: t.Optional(t.Number(),),
},);

export const RelationshipUpdateBody = t.Object({
  relationship_type: t.Optional(t.String(),),
  strength: t.Optional(t.Number(),),
},);

export const RelationshipEventBody = t.Object({
  event_type: t.String(),
  delta: t.Optional(t.Number(),),
  details: t.Optional(t.String(),),
},);

export const RelationshipResponse = t.Object({
  id: t.String({ format: "uuid", },),
  actor_id: t.String(),
  target_actor_id: t.String(),
  relationship_type: t.String(),
  strength: t.Number(),
  created_at: t.String(),
  updated_at: t.String(),
},);

export const ActorTargetParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  targetActorId: t.String({ format: "uuid", },),
},);

export const AvailabilityBody = t.Object({
  available: t.Boolean(),
  reason: t.Optional(t.String(),),
},);

export const LicensingBody = t.Object({
  license_type: t.String(),
  expires_at: t.Optional(t.String(),),
  notes: t.Optional(t.String(),),
},);

export const AvatarCreateBody = t.Object({
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  image_url: t.Optional(t.String(),),
},);

export const AvatarUpdateBody = t.Object({
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  image_url: t.Optional(t.String(),),
},);

export const AvatarSelectBody = t.Object({
  avatar_id: t.String({ format: "uuid", },),
},);

export const AvatarConfigBody = t.Object({
  selection_rule_override: t.Optional(t.String(),),
  fallback_avatar_id: t.Optional(t.String({ format: "uuid", },),),
},);

export const WorldAvatarConfigBody = t.Object({
  selection_rule_override: t.Optional(t.String(),),
  fallback_avatar_id: t.Optional(t.String({ format: "uuid", },),),
},);

export const AvatarResponse = t.Object({
  id: t.String({ format: "uuid", },),
  actor_id: t.String(),
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  image_url: t.Optional(t.String(),),
  created_at: t.String(),
},);

export const ActorIdAvatarIdParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  avatarId: t.String({ format: "uuid", },),
},);

export const ActorIdAvatarParams = t.Object({
  actorId: t.String({ format: "uuid", },),
},);

export const WorldActorParams = t.Object({
  worldId: t.String({ format: "uuid", },),
  actorId: t.String({ format: "uuid", },),
},);

export const CharacterEmotionBody = t.Object({
  emotion_name: t.String({ minLength: 1, },),
  intensity: t.Optional(t.Number({ minimum: 0, maximum: 100, },),),
},);

export const EmotionDefinitionCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
  base_expression: t.Optional(t.String(),),
},);

export const ActorEmotionParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  emotionName: t.String(),
},);

export const CharacterSystemsExportBody = t.Object({
  includeTraits: t.Optional(t.Boolean(),),
  includeMood: t.Optional(t.Boolean(),),
  includeRelationships: t.Optional(t.Boolean(),),
  includeAvatars: t.Optional(t.Boolean(),),
  includeLicensing: t.Optional(t.Boolean(),),
  includeAvailability: t.Optional(t.Boolean(),),
},);

export const CharacterSystemsImportUrlBody = t.Object({
  url: t.String({ format: "uri", },),
  actor_id: t.Optional(t.String({ format: "uuid", },),),
},);

// ── Quest schemas ─────────────────────────────────────────

export const QuestUpdateBody = t.Object({
  name: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
  status: t.Optional(t.String(),),
},);

export const QuestProgressBody = t.Object({
  progress: t.Number({ minimum: 0, },),
  status: t.Optional(t.String(),),
},);

export const QuestResponse = t.Object({
  id: t.String({ format: "uuid", },),
  name: t.String(),
  type: t.String(),
  status: t.String(),
  progress: t.Number(),
  created_at: t.String(),
  updated_at: t.String(),
},);

// ── Story items schemas ───────────────────────────────────

export const StoryItemInstanceBody = t.Object({
  itemId: t.String({ format: "uuid", },),
  locationId: t.Optional(t.String({ format: "uuid", },),),
  ownerActorId: t.Optional(t.String({ format: "uuid", },),),
  quantity: t.Optional(t.Number({ minimum: 1, },),),
},);

export const StoryItemResponse = t.Object({
  id: t.String({ format: "uuid", },),
  world_id: t.String(),
  item_id: t.String(),
  quantity: t.Number(),
  visibility: t.String(),
  created_at: t.String(),
},);

// ── Story states schemas ──────────────────────────────────

export const WorldStateCreateBody = t.Object({
  turnId: t.Optional(t.String(),),
  messageId: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
},);

export const NpcStateBody = t.Object({
  npc_id: t.String({ format: "uuid", },),
  state_key: t.String({ minLength: 1, },),
  state_value: t.Any(),
},);

export const LocationStateBody = t.Object({
  location_id: t.String({ format: "uuid", },),
  state_key: t.String({ minLength: 1, },),
  state_value: t.Any(),
},);

// ── API keys schemas ──────────────────────────────────────

export const ApiKeyCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  provider: t.String({ minLength: 1, },),
  api_key: t.String({ minLength: 1, },),
},);

// ── Notifications schemas ─────────────────────────────────

export const NotificationPreferencesBody = t.Object({
  enabled: t.Optional(t.Record(t.String(), t.Boolean(),),),
  mutedWorlds: t.Optional(t.Array(t.String(),),),
},);

// ── Telemetry schemas ─────────────────────────────────────

export const TelemetryEventBody = t.Object({
  type: t.String({ minLength: 1, },),
  sessionId: t.Optional(t.String(),),
  userId: t.Optional(t.String(),),
  chatId: t.Optional(t.String(),),
  data: t.Optional(t.Record(t.String(), t.Any(),),),
},);

// ── Admin template schemas ────────────────────────────────

export const AdminTemplateCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  content: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
},);

export const AdminTemplateUpdateBody = t.Object({
  name: t.Optional(t.String(),),
  content: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
},);

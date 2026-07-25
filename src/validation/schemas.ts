/**
 * Reusable Elysia validation schemas.
 *
 * Centralizes all `t.Object` definitions so route handlers
 * share a single source of truth for request validation.
 *
 * @module validation/schemas
 */
import { t, } from "elysia";
import {
  ActorItemType,
  ActorType,
  ActorVisibility,
  AgentType,
  AssetType,
  AssetVisibility,
  ChatMode,
  ChatParticipantRole,
  ChatType,
  ContentEncoding,
  GenerationStatus,
  ItemCategory,
  ItemRarity,
  MemoryType,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
  ModelRole,
  NoteCategory,
  PinnedState,
  QuestStatus,
  QuestType,
  StorageBackend,
  TurnStatus,
  TurnStrategy,
  TurnType,
  UserRole,
  UserStatus,
  WorldEventType,
} from "../db/enums";
/** Extract enum values as a readonly tuple for t.UnionEnum compatibility. */
const ev = <V extends string,>(o: Record<string, V>,): [V, ...V[],] => Object.values(o,) as [V, ...V[],];

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

// ── Enums (derived from src/db/enums-*.ts) ─────────────────

export const ChatTypeSchema = t.UnionEnum(ev(ChatType,),);
export const ChatModeSchema = t.UnionEnum(ev(ChatMode,),);
export const TurnStrategySchema = t.UnionEnum(ev(TurnStrategy,),);

/** Chat-level GM configuration — stored as JSON in `chats.gm_config` */
export const GmConfigSchema = t.Object({
  assistantRole: t.Optional(t.UnionEnum(["off", "helper", "gm", "moderator",],),),
  visualNovel: t.Optional(t.Boolean(),),
},);

export const MessageRoleSchema = t.UnionEnum(ev(MessageRole,),);
export const MessageContentTypeSchema = t.UnionEnum(ev(MessageContentType,),);
export const MessageVisibilitySchema = t.UnionEnum(ev(MessageVisibility,),);
export const MessageStatusSchema = t.UnionEnum(ev(MessageStatus,),);
export const ActorTypeSchema = t.UnionEnum(ev(ActorType,),);
export const AgentTypeSchema = t.UnionEnum(ev(AgentType,),);
export const UserRoleSchema = t.UnionEnum(ev(UserRole,),);
export const UserStatusSchema = t.UnionEnum(ev(UserStatus,),);
export const ChatParticipantRoleSchema = t.UnionEnum(ev(ChatParticipantRole,),);
export const PinnedStateSchema = t.UnionEnum(ev(PinnedState,),);
export const ActorVisibilitySchema = t.UnionEnum(ev(ActorVisibility,),);
export const ContentEncodingSchema = t.UnionEnum(ev(ContentEncoding,),);
export const AssetTypeSchema = t.UnionEnum(ev(AssetType,),);
export const AssetVisibilitySchema = t.UnionEnum(ev(AssetVisibility,),);
export const StorageBackendSchema = t.UnionEnum(ev(StorageBackend,),);
export const GenerationStatusSchema = t.UnionEnum(ev(GenerationStatus,),);
export const WorldEventTypeSchema = t.UnionEnum(ev(WorldEventType,),);
export const QuestTypeSchema = t.UnionEnum(ev(QuestType,),);
export const QuestStatusSchema = t.UnionEnum(ev(QuestStatus,),);
export const TurnTypeSchema = t.UnionEnum(ev(TurnType,),);
export const TurnStatusSchema = t.UnionEnum(ev(TurnStatus,),);
export const MemoryTypeSchema = t.UnionEnum(ev(MemoryType,),);
export const NoteCategorySchema = t.UnionEnum(ev(NoteCategory,),);
export const ActorItemTypeSchema = t.UnionEnum(ev(ActorItemType,),);
export const ItemCategorySchema = t.UnionEnum(ev(ItemCategory,),);
export const ItemRaritySchema = t.UnionEnum(ev(ItemRarity,),);
export const ModelRoleSchema = t.UnionEnum(ev(ModelRole,),);

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
},);

const OptionalBooleanOrNull = t.Optional(t.Union([t.Boolean(), t.Null(),],),);

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
  streaming: OptionalBooleanOrNull,
},);

export const ChatIdParams = t.Object({
  id: Id,
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
  id: Id,
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

// ── Template management (admin) ─────────────────────────────

/* eslint-disable unicorn/max-nested-calls */
export const AdminTemplateCreateBody = t.Object({
  id: t.String({ minLength: 1, },),
  name: t.String({ minLength: 1, },),
  families: t.Array(t.String(),),
  promptFormat: t.UnionEnum(["tags", "natural", "tags-and-natural", "json",],),
  maxTokenHint: t.Numeric({ minimum: 64, maximum: 4096, },),
  defaults: t.Object({
    cfgScale: t.Numeric({ minimum: 1, maximum: 30, },),
    steps: t.Numeric({ minimum: 1, maximum: 200, },),
    sampler: t.String(),
    scheduler: t.Optional(t.String(),),
    clipSkip: t.Optional(t.Numeric(),),
  },),
  templates: t.Object({
    instant: t.Any(),
    balanced: t.Any(),
    detailed: t.Any(),
  },),
},);
/* eslint-enable unicorn/max-nested-calls */

/* eslint-disable unicorn/max-nested-calls */
export const AdminTemplateUpdateBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, },),),
  families: t.Optional(t.Array(t.String(),),),
  promptFormat: t.Optional(t.UnionEnum(["tags", "natural", "tags-and-natural", "json",],),),
  maxTokenHint: t.Optional(t.Numeric({ minimum: 64, maximum: 4096, },),),
  defaults: t.Optional(t.Object({
    cfgScale: t.Numeric({ minimum: 1, maximum: 30, },),
    steps: t.Numeric({ minimum: 1, maximum: 200, },),
    sampler: t.String(),
    scheduler: t.Optional(t.String(),),
    clipSkip: t.Optional(t.Numeric(),),
  },),),
  templates: t.Optional(t.Object({
    instant: t.Any(),
    balanced: t.Any(),
    detailed: t.Any(),
  },),),
},);
/* eslint-enable unicorn/max-nested-calls */

// ── World routes ───────────────────────────────────────────

export const WorldCreateBody = t.Object({
  name: Name,
  description: t.Optional(t.String(),),
  locationCount: t.Optional(t.Numeric({ minimum: 0, },),),
},);

export const WorldUpdateBody = t.Object({
  name: t.Optional(Name,),
  description: t.Optional(t.String(),),
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

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
  AvailabilityStatus,
  AvatarSelectionRule,
  ChatMode,
  ChatParticipantRole,
  ChatType,
  ContentEncoding,
  EmotionType,
  GenerationStatus,
  ItemCategory,
  ItemRarity,
  LicenseType,
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
  RelationshipEventType,
  RelationshipType,
  StorageBackend,
  TraitCategory,
  TurnStatus,
  TurnStrategy,
  TurnType,
  UserRole,
  UserStatus,
  WorldEventType,
  WorldTraitCategory,
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
  /** Memory carry mode: "full" (default), "selective", or "fresh" */
  memoryCarry: t.Optional(t.Union([t.Literal("full",), t.Literal("selective",), t.Literal("fresh",),],),),
  /** Specific memory IDs to carry forward (when memoryCarry === "selective") */
  memoryCarryIds: t.Optional(t.Array(t.String(),),),
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
  tags: t.Optional(t.String(),),
  actorType: t.Optional(ActorTypeSchema,),
  agentType: t.Optional(AgentTypeSchema,),
  description: t.Optional(t.String(),),
  personality: t.Optional(t.String(),),
  scenario: t.Optional(t.String(),),
  welcomeMessage: t.Optional(t.String(),),
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
  /** Optimistic concurrency: current data_version from client. Required for updates. */
  dataVersion: t.Optional(t.Number(),),
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

// ── Character Avatars ─────────────────────────────────────

export const ActorIdAvatarParams = t.Object({
  actorId: Id,
},);

export const ActorIdAvatarIdParams = t.Object({
  actorId: Id,
  avatarId: Id,
},);

export const WorldActorParams = t.Object({
  worldId: Id,
  actorId: Id,
},);

export const AvatarCreateBody = t.Object({
  assetId: Id,
  label: t.Optional(t.String(),),
  tags: t.Optional(t.Record(t.String(), t.Array(t.String(),),),),
  isPrimary: t.Optional(t.Boolean(),),
  sortOrder: t.Optional(t.Numeric(),),
},);

export const AvatarUpdateBody = t.Object({
  label: t.Optional(t.String(),),
  tags: t.Optional(t.Record(t.String(), t.Array(t.String(),),),),
  isPrimary: t.Optional(t.Boolean(),),
  sortOrder: t.Optional(t.Numeric(),),
},);

export const AvatarSelectBody = t.Object({
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  action: t.Optional(t.String(),),
  location: t.Optional(t.String(),),
  time: t.Optional(t.String(),),
  outfit: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
},);

export const AvatarConfigBody = t.Object({
  selectionRule: t.Optional(t.UnionEnum(ev(AvatarSelectionRule,),),),
  weights: t.Optional(t.Record(t.String(), t.Numeric(),),),
  fallbackChain: t.Optional(t.Array(t.UnionEnum(ev(AvatarSelectionRule,),),),),
},);

export const WorldAvatarConfigBody = t.Object({
  selectionRuleOverride: t.Optional(t.UnionEnum(ev(AvatarSelectionRule,),),),
  weightsOverride: t.Optional(t.Record(t.String(), t.Numeric(),),),
},);

// ── Character Emotions ────────────────────────────────────

export const ActorEmotionParams = t.Object({
  actorId: Id,
  emotionId: Id,
},);

export const CharacterEmotionBody = t.Object({
  emotionId: Id,
  intensity: t.Optional(t.Numeric({ minimum: 0, maximum: 1, },),),
  context: t.Optional(t.String(),),
  expiresAt: t.Optional(t.String(),),
},);

export const EmotionDefinitionCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  displayName: t.String({ minLength: 1, },),
  category: t.String({ minLength: 1, },),
  valence: t.Numeric({ minimum: -1, maximum: 1, },),
  arousal: t.Numeric({ minimum: 0, maximum: 1, },),
  icon: t.Optional(t.String(),),
},);

// ── Character Emotion Avatars ─────────────────────────────

export const ActorJobParams = t.Object({
  actorId: Id,
  jobId: Id,
},);

export const EmotionAvatarBatchBody = t.Object({
  baseAvatarId: Id,
  emotions: t.Optional(t.Array(t.UnionEnum(ev(EmotionType,),),),),
  promptPrefix: t.Optional(t.String(),),
  negativePrompt: t.Optional(t.String(),),
},);

// ── Character Mood ────────────────────────────────────────

export const MoodCreateBody = t.Object({
  worldId: t.Optional(t.String(),),
  happiness: t.Optional(t.Numeric({ minimum: 0, maximum: 100, },),),
  baseMood: t.Optional(t.String(),),
  moodStability: t.Optional(t.Numeric({ minimum: 0, maximum: 1, },),),
},);

export const MoodUpdateBody = t.Object({
  worldId: t.Optional(t.String(),),
  happiness: t.Optional(t.Numeric({ minimum: 0, maximum: 100, },),),
  currentMood: t.Optional(t.String(),),
  moodStability: t.Optional(t.Numeric({ minimum: 0, maximum: 1, },),),
  expressionModifiers: t.Optional(t.Record(t.String(), t.Numeric(),),),
},);

export const MoodDeltaBody = t.Object({
  worldId: t.Optional(t.String(),),
  delta: t.Numeric({ minimum: -100, maximum: 100, },),
},);

export const MoodEventBody = t.Object({
  worldId: t.Optional(t.String(),),
  eventType: t.String({ minLength: 1, },),
  happinessDelta: t.Numeric({ minimum: -100, maximum: 100, },),
  moodOverride: t.Optional(t.String(),),
  source: t.String({ minLength: 1, },),
  sourceId: t.Optional(t.String(),),
},);

export const MoodEventsQuery = t.Object({
  worldId: t.Optional(t.String(),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500, default: 50, },),),
},);

// ── Character Relationships ───────────────────────────────

export const ActorTargetParams = t.Object({
  actorId: Id,
  targetActorId: Id,
},);

export const RelationshipCreateBody = t.Object({
  targetActorId: Id,
  worldId: t.Optional(t.String(),),
  relationshipType: t.UnionEnum(ev(RelationshipType,),),
  standing: t.Optional(t.Numeric(),),
  trust: t.Optional(t.Numeric(),),
  familiarity: t.Optional(t.Numeric({ minimum: 0, maximum: 100, },),),
  isBidirectional: t.Optional(t.Boolean(),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const RelationshipUpdateBody = t.Object({
  worldId: t.Optional(t.String(),),
  relationshipType: t.Optional(t.UnionEnum(ev(RelationshipType,),),),
  standing: t.Optional(t.Numeric(),),
  trust: t.Optional(t.Numeric(),),
  familiarity: t.Optional(t.Numeric({ minimum: 0, maximum: 100, },),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const RelationshipEventBody = t.Object({
  targetActorId: Id,
  worldId: t.Optional(t.String(),),
  eventType: t.UnionEnum(ev(RelationshipEventType,),),
  standingDelta: t.Optional(t.Numeric(),),
  trustDelta: t.Optional(t.Numeric(),),
  familiarityDelta: t.Optional(t.Numeric(),),
},);

// ── Character Traits ──────────────────────────────────────

export const TraitCreateBody = t.Object({
  category: t.UnionEnum(ev(TraitCategory,),),
  name: t.String({ minLength: 1, },),
  value: t.String({ minLength: 1, },),
},);

export const TraitUpdateBody = t.Object({
  value: t.String({ minLength: 1, },),
},);

export const WorldTraitCreateBody = t.Object({
  category: t.UnionEnum(ev(WorldTraitCategory,),),
  name: t.String({ minLength: 1, },),
  value: t.String({ minLength: 1, },),
},);

export const LocationTraitCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  value: t.String({ minLength: 1, },),
  bonus: t.Optional(t.Numeric(),),
  penalty: t.Optional(t.Numeric(),),
  effects: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const LocationTraitUpdateBody = t.Object({
  value: t.String({ minLength: 1, },),
  bonus: t.Optional(t.Numeric(),),
  penalty: t.Optional(t.Numeric(),),
  effects: t.Optional(t.Record(t.String(), t.Any(),),),
},);

// ── Character IO ──────────────────────────────────────────

export const CharacterSystemsExportBody = t.Object({
  worldId: t.Optional(t.String(),),
  includeTraits: t.Optional(t.Boolean(),),
  includeMood: t.Optional(t.Boolean(),),
  includeRelationships: t.Optional(t.Boolean(),),
  includeAvatars: t.Optional(t.Boolean(),),
  includeLicensing: t.Optional(t.Boolean(),),
  includeAvailability: t.Optional(t.Boolean(),),
},);

export const CharacterSystemsImportUrlBody = t.Object({
  url: t.String({ minLength: 1, format: "uri", },),
},);

// ── Character Licensing ───────────────────────────────────

export const LicensingBody = t.Object({
  licenseType: t.Optional(t.UnionEnum(ev(LicenseType,),),),
  customLicenseText: t.Optional(t.String(),),
  attribution: t.Optional(t.String(),),
  allowDerivatives: t.Optional(t.Boolean(),),
  allowCommercial: t.Optional(t.Boolean(),),
  shareAlike: t.Optional(t.Boolean(),),
},);

// ── Character Availability ────────────────────────────────

export const AvailabilityBody = t.Object({
  status: t.Optional(t.UnionEnum(ev(AvailabilityStatus,),),),
  usagePolicy: t.Optional(t.String(),),
  activityRestrictions: t.Optional(t.Array(t.String(),),),
  contentPolicy: t.Optional(t.String(),),
  nsfwPolicy: t.Optional(t.String(),),
},);

// ── Characters (actors) ──────────────────────────────────
// ActorCreateBody and ActorUpdateBody are defined in the Actor routes section above.

// ── Story Items ───────────────────────────────────────────

export const StoryItemInstanceBody = t.Object({
  itemId: Id,
  locationId: Id,
  quantity: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
},);

// ── Story States ──────────────────────────────────────────

export const NpcStateBody = t.Object({
  locationId: t.Optional(t.String(),),
  status: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  inventory: t.Optional(t.Array(t.String(),),),
  notes: t.Optional(t.String(),),
},);

export const LocationStateBody = t.Object({
  weather: t.Optional(t.String(),),
  timeOfDay: t.Optional(t.String(),),
  events: t.Optional(t.Array(t.String(),),),
  description: t.Optional(t.String(),),
},);

export const WorldStateCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
  data: t.Optional(t.Record(t.String(), t.Any(),),),
},);

// ── Quests ────────────────────────────────────────────────

export const QuestUpdateBody = t.Object({
  name: t.Optional(Name,),
  description: t.Optional(t.String(),),
  status: t.Optional(t.UnionEnum(ev(QuestStatus,),),),
  objectives: t.Optional(t.Array(t.Object({
    id: t.Optional(t.String(),),
    description: t.String(),
    completed: t.Optional(t.Boolean(),),
  },),),),
},);

export const QuestProgressBody = t.Object({
  objectiveId: t.Optional(t.String(),),
  completed: t.Optional(t.Boolean(),),
  chatId: t.Optional(t.String(),),
},);

// ── Blog ──────────────────────────────────────────────────

export const BlogPostCreateBody = t.Object({
  title: t.String({ minLength: 1, },),
  body: t.String({ minLength: 1, },),
  visibility: t.Optional(t.String(),),
  author_type: t.Optional(t.String(),),
  category: t.Optional(t.String(),),
  world_id: t.Optional(t.String(),),
  character_id: t.Optional(t.String(),),
  tags: t.Optional(t.Array(t.String(),),),
  scheduled_at: t.Optional(t.String(),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const BlogPostUpdateBody = t.Object({
  title: t.Optional(t.String({ minLength: 1, },),),
  body: t.Optional(t.String({ minLength: 1, },),),
  visibility: t.Optional(t.String(),),
  status: t.Optional(t.String(),),
  category: t.Optional(t.String(),),
  tags: t.Optional(t.Array(t.String(),),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const BlogCommentCreateBody = t.Object({
  body: t.String({ minLength: 1, },),
},);

export const BlogPostStatusBody = t.Object({
  status: t.String({ minLength: 1, },),
},);

// ── Telemetry ─────────────────────────────────────────────

export const TelemetryEventBody = t.Object({
  type: t.String({ minLength: 1, },),
  sessionId: t.Optional(t.String(),),
  userId: t.Optional(t.String(),),
  chatId: t.Optional(t.String(),),
  data: t.Optional(t.Record(t.String(), t.Any(),),),
},);

// ── Notifications ─────────────────────────────────────────

export const NotificationPreferencesBody = t.Object({
  enabled: t.Optional(t.Record(t.String(), t.Boolean(),),),
  mutedWorlds: t.Optional(t.Array(t.String(),),),
},);

// ── Admin Character Overrides ─────────────────────────────

export const AdminOverrideCreateBody = t.Object({
  action: t.String({ minLength: 1, },),
  visibilityOverride: t.Optional(t.String(),),
  licenseOverride: t.Optional(t.String(),),
  reason: t.Optional(t.String(),),
  expiresAt: t.Optional(t.String(),),
},);

// ── API Keys ──────────────────────────────────────────────

export const ApiKeyCreateBody = t.Object({
  providerName: t.String({ minLength: 1, },),
  apiKey: t.String({ minLength: 1, },),
},);

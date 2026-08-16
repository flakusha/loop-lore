/**
 * Chat route validation schemas.
 */

import { t, } from "elysia";
import {
  ChatModeSchema,
  ChatParticipantRoleSchema,
  ChatTypeSchema,
  ChatVisibilitySchema,
  GmConfigSchema,
  GmGuidanceSchema,
  Id,
  Name,
  NullableId,
  OptionalId,
  TurnStrategySchema,
} from "./primitives";

// ── Chat routes ────────────────────────────────────────────

export const ChatCreateBody = t.Object({
  name: Name,
  type: t.Optional(ChatTypeSchema,),
  mode: t.Optional(ChatModeSchema,),
  turnStrategy: t.Optional(TurnStrategySchema,),
  participantIds: t.Optional(t.Array(t.String(),),),
  worldId: OptionalId,
  currentLocationId: OptionalId,
  gmConfig: t.Optional(GmConfigSchema,),
  visualNovel: t.Optional(t.Boolean(),),
  visibility: t.Optional(ChatVisibilitySchema,),
  templateId: t.Optional(t.String({ minLength: 1, },),),
  // Memory carry: seed the new chat with the participant character's
  // memories (full = all, selective = only memoryCarryIds, fresh = none).
  memoryCarry: t.Optional(t.Union([
    t.Literal("full",),
    t.Literal("selective",),
    t.Literal("fresh",),
  ],),),
  memoryCarryIds: t.Optional(t.Array(t.String(),),),
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
  thinkingVisibility: t.Optional(t.Union([
    t.Literal("hidden",),
    t.Literal("collapsed",),
    t.Literal("visible",),
  ],),),
  promptOverride: t.Optional(t.Union([
    t.String(),
    t.Null(),
  ],),),
  quickReplies: t.Optional(t.Union([
    t.Array(t.Object({
      label: t.String(),
      command: t.String(),
      trigger: t.Optional(t.Union([
        t.Literal("startup",),
        t.Literal("user",),
        t.Literal("ai",),
      ],),),
    },),),
    t.Null(),
  ],),),
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
  features: t.Optional(t.Array(t.String(),),),
  visibility: t.Optional(ChatVisibilitySchema,),
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
  features: t.Optional(t.Array(t.String(),),),
  visibility: t.Optional(ChatVisibilitySchema,),
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
  features: t.Optional(t.Array(t.String(),),),
  visibility: t.Optional(ChatVisibilitySchema,),
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
  /** Carry location context: chat_sections + message section links. */
  location: t.Optional(t.Boolean(),),
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

/**
 * Body for `PUT /api/v1/chats/:id/gm-guidance` — runtime human-GM narrative
 * guidance. Unlike `gmConfig` on the main update route, this is NOT a key
 * mechanic and can be patched on an online chat.
 */
export const GmGuidanceUpdateBody = t.Object({
  storyMode: t.Optional(t.Boolean(),),
  gmGuidance: t.Optional(GmGuidanceSchema,),
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

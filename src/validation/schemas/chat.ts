// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat route validation schemas.
 */

import { t, } from "elysia";
import {
  ChatHistoryCarrySchema,
  ChatModeSchema,
  ChatParticipantRoleSchema,
  ChatTypeSchema,
  ChatVisibilitySchema,
  EncryptionLevelSchema,
  GmConfigSchema,
  GmGuidanceSchema,
  Id,
  MemoryCarrySchema,
  Name,
  NullableChatRenderingOverrideSchema,
  NullableId,
  OptionalId,
  OutputStylePresetSchema,
  QuickReplyTriggerSchema,
  ThinkingVisibilitySchema,
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
  renderingOverride: t.Optional(NullableChatRenderingOverrideSchema,),
  visibility: t.Optional(ChatVisibilitySchema,),
  /** Encryption tier for message content at rest. Defaults to "none" on the server. */
  encryptionLevel: t.Optional(EncryptionLevelSchema,),
  templateId: t.Optional(t.String({ minLength: 1, },),),
  // Memory carry: seed the new chat with the participant character's
  // memories (full = all, selective = only memoryCarryIds, fresh = none).
  memoryCarry: t.Optional(MemoryCarrySchema,),
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
  renderingOverride: t.Optional(NullableChatRenderingOverrideSchema,),
  thinkingVisibility: t.Optional(ThinkingVisibilitySchema,),
  promptOverride: t.Optional(t.Union([
    t.String({ maxLength: 20_000, },),
    t.Null(),
  ],),),
  quickReplies: t.Optional(t.Union([
    t.Array(t.Object({
      label: t.String(),
      command: t.String(),
      trigger: t.Optional(QuickReplyTriggerSchema,),
    },),),
    t.Null(),
  ],),),
  outputStylePreset: t.Optional(OutputStylePresetSchema,),
  customInstructions: t.Optional(t.Union([
    t.String({ maxLength: 5000, },),
    t.Null(),
  ],),),
},);

/**
 * A chat setup template — a validated preset that seeds a chat's key mechanics
 * at creation. `mode`, `turnStrategy`, `worldId` and the GM-execution sub-keys of
 * `gmConfig` are the immutable key mechanics once the bound chat goes online;
 * presentation/VN sub-keys of `gmConfig` stay mutable.
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
  renderingOverride: t.Optional(NullableChatRenderingOverrideSchema,),
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
  renderingOverride: t.Optional(NullableChatRenderingOverrideSchema,),
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
  renderingOverride: t.Optional(NullableChatRenderingOverrideSchema,),
  features: t.Optional(t.Array(t.String(),),),
  visibility: t.Optional(ChatVisibilitySchema,),
},);

/** Carry options for chat migration. */
export const ChatMigrateCarrySchema = t.Object({
  participants: t.Optional(t.Boolean(),),
  memory: t.Optional(t.Boolean(),),
  /** Carry party/game state: story_turns, quest_progress, group_initiatives. */
  state: t.Optional(t.Boolean(),),
  /** Carry chat pins + VN choice history. */
  pins: t.Optional(t.Boolean(),),
  /** Carry message history: none | summary | full. */
  history: t.Optional(ChatHistoryCarrySchema,),
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

export const ChatAutoTranslateBody = t.Object({
  targetLang: t.Optional(t.String(),),
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

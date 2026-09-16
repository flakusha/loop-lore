// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request/response schemas for the unified prompt-template API (FEAT-065).
 *
 * `payload` is modality-shaped and validated by the template service, so it
 * stays `Type.Unknown()` on the wire. Because `Type.Unknown()` degrades
 * Elysia's request-body inference, consumers cast the validated body once at
 * the route boundary via the exported `Static` aliases.
 */
import { type Static, Type, } from "@sinclair/typebox";

/** */
export const TemplateModalitySchema = Type.Union([
  Type.Literal("llm",),
  Type.Literal("image",),
  Type.Literal("video",),
  Type.Literal("audio",),
],);

/** */
export const TemplateDetailLevelSchema = Type.Union([
  Type.Literal("instant",),
  Type.Literal("balanced",),
  Type.Literal("detailed",),
],);

/** One ordered section of an LLM prompt template. */
export const LlmTemplateSectionSchema = Type.Object({
  identifier: Type.String({ default: "", },),
  role: Type.Union([
    Type.Literal("system",),
    Type.Literal("user",),
    Type.Literal("assistant",),
  ],),
  content: Type.String({ default: "", },),
  enabled: Type.Boolean({ default: true, },),
  priority: Type.Integer({ minimum: 0, default: 0, },),
},);

/** */
export const TemplateCreateBody = Type.Object({
  modality: TemplateModalitySchema,
  name: Type.String({ minLength: 1, maxLength: 200, },),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()],),),
  model_family: Type.Optional(Type.Union([Type.String(), Type.Null()],),),
  detail_level: Type.Optional(TemplateDetailLevelSchema,),
  payload: Type.Unknown(),
},);

/** */
export const TemplateUpdateBody = Type.Partial(TemplateCreateBody,);

/** */
export type TemplateCreateBodyT = Static<typeof TemplateCreateBody>;
/** */
export type TemplateUpdateBodyT = Static<typeof TemplateUpdateBody>;

/** Apply-request context: freeform {{variable}} values plus LLM anchors. */
export const TemplateApplyBody = Type.Object({
  context: Type.Optional(Type.Record(Type.String(), Type.String(),),),
  actorId: Type.Optional(Type.String(),),
  chatId: Type.Optional(Type.String(),),
  modelId: Type.Optional(Type.String(),),
},);

/** */
export type TemplateApplyBodyT = Static<typeof TemplateApplyBody>;

/** */
export const TemplateImportBody = Type.Object({
  templates: Type.Array(TemplateCreateBody, { maxItems: 200, },),
},);

/** */
export type TemplateImportBodyT = Static<typeof TemplateImportBody>;

/** */
export const TemplateSummaryResponse = Type.Object({
  templates: Type.Array(Type.Object({
    id: Type.String(),
    modality: TemplateModalitySchema,
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()],),
    model_family: Type.Union([Type.String(), Type.Null()],),
    detail_level: TemplateDetailLevelSchema,
    isPreset: Type.Boolean(),
    isOwner: Type.Boolean(),
  },),),
},);

/** */
export const TemplateImportResponse = Type.Object({
  imported: Type.Integer(),
  skipped: Type.Integer(),
},);

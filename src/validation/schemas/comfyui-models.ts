// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Schemas for the ComfyUI model-discovery endpoint and user override key. */
import { t, } from "elysia";

export const ComfyUIModelSelectionSchema = t.Object(
  {
    clip: t.Optional(t.String({ maxLength: 512, },),),
    diffusion: t.Optional(t.String({ maxLength: 512, },),),
    vae: t.Optional(t.String({ maxLength: 512, },),),
    checkpoint: t.Optional(t.String({ maxLength: 512, },),),
    clip_vision: t.Optional(t.String({ maxLength: 512, },),),
    loras: t.Optional(t.String({ maxLength: 512, },),),
    noVae: t.Optional(t.Boolean(),),
  },
  { additionalProperties: false, },
);

export const ComfyUIModelQuery = t.Object({
  provider: t.Optional(t.String({ maxLength: 128, },),),
  kind: t.Optional(t.UnionEnum(["video", "image",],),),
},);

const ComfyUIModelRoleViewSchema = t.Object({
  candidates: t.Array(t.String(),),
  selected: t.Union([t.String(), t.Null(),],),
  source: t.UnionEnum(["user", "admin", "config", "discovery", "none",],),
});

export const ComfyUIModelsResponse = t.Object({
  provider: t.String(),
  noVae: t.Boolean(),
  clip: t.Array(t.String(),),
  diffusion: t.Array(t.String(),),
  vae: t.Array(t.String(),),
  checkpoint: t.Array(t.String(),),
  clip_vision: t.Array(t.String(),),
  loras: t.Array(t.String(),),
  clipRole: ComfyUIModelRoleViewSchema,
  diffusionRole: ComfyUIModelRoleViewSchema,
  vaeRole: ComfyUIModelRoleViewSchema,
  checkpointRole: ComfyUIModelRoleViewSchema,
  clipVisionRole: ComfyUIModelRoleViewSchema,
  lorasRole: ComfyUIModelRoleViewSchema,
});

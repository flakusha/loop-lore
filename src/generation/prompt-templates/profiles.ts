// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  mixedTagNaturalTemplates,
  naturalTemplates,
  tagTemplates,
} from "./templates";
import type {
  ImageModelProfile,
  ImageModelProfileRegistry,
} from "./types";

// ── Built-in profile registry ────────────────────────────────

const TAG_STYLE = "best quality, masterpiece, highres";
const NATURAL_STYLE = "highly detailed, cinematic lighting, professional photography";
const ANIME_STYLE = "best quality, masterpiece, anime style, vibrant colors";

export const BUILTIN_PROFILES: Record<string, ImageModelProfile> = {
  sd1: {
    id: "sd1",
    name: "Stable Diffusion 1.x/2.x",
    families: ["sd1", "sd2",],
    promptFormat: "tags",
    maxTokenHint: 75,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates(TAG_STYLE,),
  },

  sdxl: {
    id: "sdxl",
    name: "SDXL",
    families: ["sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 7, steps: 28, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates(TAG_STYLE,),
  },

  illustrious: {
    id: "illustrious",
    name: "Illustrious (Danbooru tags)",
    families: ["illustrious", "sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 5, steps: 28, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates("masterpiece, best quality, highres",),
  },

  noob: {
    id: "noob",
    name: "NoobAI (Danbooru+E621 tags)",
    families: ["noob", "sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 5, steps: 28, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates("masterpiece, best quality, highres",),
  },

  pony: {
    id: "pony",
    name: "Pony (score tags)",
    families: ["pony", "sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 7.5, steps: 30, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates("score_9, score_8_up, score_7_up, score_6_up, score_5_up",),
  },

  sd3: {
    id: "sd3",
    name: "Stable Diffusion 3/3.5",
    families: ["sd3",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 28, sampler: "dpmpp_2m", scheduler: "karras", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },

  flux: {
    id: "flux",
    name: "FLUX (dev/schnell/klein)",
    families: ["flux",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler", scheduler: "default", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },

  krea2: {
    id: "krea2",
    name: "Krea 2",
    families: ["krea2",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 12, sampler: "euler", scheduler: "default", },
    templates: {
      instant: {
        yourself: `Describe {{charName}} briefly. {{charPrefix}}{{charDescription}}`,
        face: `Describe {{charName}} face briefly. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Describe {{userName}} briefly. {{userDescription}}`,
        scene: `Brief scene: {{sceneSummary}}`,
        last: `Brief: {{lastMessage}}`,
        background: `Brief background: {{sceneSummary}}. landscape, scenery`,
      },
      balanced: {
        yourself:
          `Describe {{charName}} in one flowing paragraph. Focus on visual details, lighting, composition. full body portrait, {{charPrefix}}{{charDescription}}`,
        face:
          `Describe {{charName}} face in one paragraph. Focus on features, expression, lighting. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Describe {{userName}} in one paragraph. Focus on appearance. {{userDescription}}`,
        scene:
          `Describe the scene in one flowing paragraph. Focus on composition, lighting, colors, mood: {{sceneSummary}}`,
        last: `Describe in one flowing paragraph. Focus on visual details: {{lastMessage}}`,
        background: `Describe background in one paragraph: {{sceneSummary}}. landscape, scenery, environment`,
      },
      detailed: {
        yourself:
          `Write a detailed paragraph describing {{charName}}. Include appearance, clothing, expression, pose, lighting. full body portrait, {{charPrefix}}{{charDescription}}`,
        face:
          `Write a detailed paragraph describing {{charName}} face. Include facial features, expression, skin texture, eye color, lighting. face close-up, {{charPrefix}}{{charDescription}}`,
        me:
          `Write a detailed paragraph describing {{userName}}. Include appearance, clothing, pose. {{userDescription}}`,
        scene:
          `Write a detailed paragraph describing the scene. Include composition, lighting, color palette, mood, atmosphere, camera angle: {{sceneSummary}}`,
        last: `Write a detailed paragraph. Include visual details, lighting, composition, mood: {{lastMessage}}`,
        background:
          `Write a detailed paragraph describing the background. Environment, lighting, time of day, atmosphere: {{sceneSummary}}`,
      },
    },
  },

  anima: {
    id: "anima",
    name: "Anima (tags + natural language)",
    families: ["anima",],
    promptFormat: "tags-and-natural",
    maxTokenHint: 150,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler_a", scheduler: "karras", },
    templates: mixedTagNaturalTemplates(ANIME_STYLE,),
  },

  ideogram: {
    id: "ideogram",
    name: "Ideogram 4 (JSON captions)",
    families: ["ideogram",],
    promptFormat: "json",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 30, sampler: "dpmpp_2m", scheduler: "karras", },
    templates: {
      instant: {
        yourself:
          `Output JSON: {"high_level_description": "{{charName}}", "style_description": {"style": "portrait"}, "compositional_deconstruction": {"foreground": ["{{charDescription}}"]}}`,
        face:
          `Output JSON: {"high_level_description": "{{charName}} face", "style_description": {"style": "portrait"}, "compositional_deconstruction": {"foreground": ["{{charDescription}} face close-up"]}}`,
        me:
          `Output JSON: {"high_level_description": "{{userName}}", "style_description": {"style": "portrait"}, "compositional_deconstruction": {"foreground": ["{{userDescription}}"]}}`,
        scene: `Output JSON describing the scene: {{sceneSummary}}`,
        last: `Output JSON describing: {{lastMessage}}`,
        background: `Output JSON for background: {{sceneSummary}}`,
      },
      balanced: {
        yourself: `Output JSON with detailed composition for {{charName}}. {{charDescription}}`,
        face:
          `Output JSON with detailed composition for {{charName}} face. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Output JSON with detailed composition for {{userName}}. {{userDescription}}`,
        scene: `Output JSON describing scene composition: {{sceneSummary}}`,
        last: `Output JSON describing composition: {{lastMessage}}`,
        background: `Output JSON for background: {{sceneSummary}}`,
      },
      detailed: {
        yourself:
          `Output detailed JSON with full compositional_deconstruction for {{charName}}. Include foreground, background, lighting, color palette. full body portrait, {{charPrefix}}{{charDescription}}`,
        face:
          `Output detailed JSON with full compositional_deconstruction for {{charName}} face. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Output detailed JSON with full composition for {{userName}}. {{userDescription}}`,
        scene: `Output detailed JSON with full compositional_deconstruction for scene: {{sceneSummary}}`,
        last: `Output detailed JSON with full composition for: {{lastMessage}}`,
        background: `Output detailed JSON for background: {{sceneSummary}}`,
      },
    },
  },

  qwen: {
    id: "qwen",
    name: "Qwen Image 2.0",
    families: ["qwen",],
    promptFormat: "natural",
    maxTokenHint: 1000,
    defaults: { cfgScale: 7, steps: 28, sampler: "dpmpp_2m", scheduler: "karras", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },

  chroma: {
    id: "chroma",
    name: "Chroma",
    families: ["chroma",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler", scheduler: "default", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },
};

// ── Default registry ────────────────────────────────────────

export const DEFAULT_PROFILE_REGISTRY: ImageModelProfileRegistry = {
  profiles: BUILTIN_PROFILES,
  defaultProfileId: "sdxl",
  modelMatching: [
    { pattern: "illustrious", profileId: "illustrious", },
    { pattern: "noobai", profileId: "noob", },
    { pattern: "noob", profileId: "noob", },
    { pattern: "pony", profileId: "pony", },
    { pattern: "sd1", profileId: "sd1", },
    { pattern: "sd2", profileId: "sd1", },
    { pattern: "sd3", profileId: "sd3", },
    { pattern: "sd3.5", profileId: "sd3", },
    { pattern: "flux", profileId: "flux", },
    { pattern: "krea", profileId: "krea2", },
    { pattern: "anima", profileId: "anima", },
    { pattern: "ideogram", profileId: "ideogram", },
    { pattern: "qwen", profileId: "qwen", },
    { pattern: "chroma", profileId: "chroma", },
    { pattern: "sdxl", profileId: "sdxl", },
  ],
};

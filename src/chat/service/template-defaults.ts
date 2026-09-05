// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat setup template built-in defaults.
 *
 * The default templates are code-defined so fresh deployments get a working
 * set out of the box; `seedChatSetupTemplates` upserts them idempotently by
 * slug (see `templates.ts`). Admin-created templates survive reseeding.
 */
import { safeJsonStringify, } from "../../utils";
/** Default chat setup template shape (code-defined). */
export interface ChatSetupTemplateDefault {
  id: string;
  slug: string;
  name: string;
  description: string;
  mode: string;
  turn_strategy: string;
  /** `gm_config` JSON to seed onto chats created from this template (stringified). */
  gmConfig: string | null;
  /** Short display tags shown as a feature list on template selection. */
  features: string[];
  /** Chat visibility state seeded onto chats created from this template. */
  visibility?: string;
}
/**
 * Build the seed `gm_config` JSON for a template. Visual-novel templates
 * opt into `renderingOverride="visual_novel"`; everything else is null.
 * @param visualNovel
 */
function buildGmConfig(visualNovel: boolean,): string | null {
  if (!visualNovel) { return null; }
  const result = safeJsonStringify({ renderingOverride: "visual_novel" as const, },);
  return result.ok ? result.value : null;
}

/**
 * Built-in starter templates. Seeded idempotently by slug — existing rows are
 * never overwritten, so admin-created or admin-edited templates survive, and
 * new defaults backfill into existing deployments.
 */
export const CHAT_SETUP_TEMPLATE_DEFAULTS: ChatSetupTemplateDefault[] = [
  {
    id: "template-simple-direct",
    slug: "simple-direct",
    name: "Simple 1:1 Chat",
    description: "A lightweight direct chat with a single character, round-robin turns.",
    mode: "direct",
    turn_strategy: "round_robin",
    gmConfig: buildGmConfig(false,),
    features: ["no gm", "no assistant",],
    visibility: "private",
  },
  {
    id: "template-roleplay",
    slug: "advanced-roleplay",
    name: "Advanced 1:1 Roleplay",
    description: "Story-driven 1:1 roleplay with scene-based narration.",
    mode: "story",
    turn_strategy: "scene_based",
    gmConfig: buildGmConfig(false,),
    features: ["rpg mode", "no gm", "no assistant",],
    visibility: "private",
  },
  {
    id: "template-group-gm",
    slug: "group-gm",
    name: "Group + GM",
    description: "A group chat with a game-master driver and round-robin turns.",
    mode: "group",
    turn_strategy: "round_robin",
    gmConfig: buildGmConfig(false,),
    features: ["gm", "group",],
    visibility: "private",
  },
  {
    id: "template-brainstorm",
    slug: "brainstorm-assistant",
    name: "Brainstorm Assistant",
    description: "A direct chat for ideation and working through a topic.",
    mode: "direct",
    turn_strategy: "round_robin",
    gmConfig: buildGmConfig(false,),
    features: ["assistant", "no gm",],
    visibility: "private",
  },
  {
    id: "template-visual-novel",
    slug: "visual-novel",
    name: "Visual Novel",
    description: "Story mode with the visual-novel overlay enabled for choice cards.",
    mode: "story",
    turn_strategy: "scene_based",
    gmConfig: buildGmConfig(true,),
    features: ["vn mode", "rpg mode",],
    visibility: "private",
  },
  {
    id: "template-world",
    slug: "world",
    name: "World Chat",
    description:
      "Public world/location chat: RPG narration, round-robin turns, no GM/assistant. Default binding for chats auto-created at location creation.",
    mode: "story",
    turn_strategy: "round_robin",
    gmConfig: buildGmConfig(false,),
    features: ["rpg mode", "no gm", "no assistant", "public",],
    visibility: "public",
  },
];

/** Slug of the default template bound to auto-created location chats. */
export const WORLD_TEMPLATE_SLUG = "world";

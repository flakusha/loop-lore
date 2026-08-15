/**
 * Chat setup template built-in defaults.
 *
 * The default templates are code-defined so fresh deployments get a working
 * set out of the box; `seedChatSetupTemplates` upserts them idempotently by
 * slug (see `templates.ts`). Admin-created templates survive reseeding.
 */

/** Default chat setup template shape (code-defined). */
export interface ChatSetupTemplateDefault {
  id: string;
  slug: string;
  name: string;
  description: string;
  mode: string;
  turn_strategy: string;
  visual_novel: number;
  /** Short display tags shown as a feature list on template selection. */
  features: string[];
  /** Chat visibility state seeded onto chats created from this template. */
  visibility?: string;
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
    visual_novel: 0,
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
    visual_novel: 0,
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
    visual_novel: 0,
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
    visual_novel: 0,
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
    visual_novel: 1,
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
    visual_novel: 0,
    features: ["rpg mode", "no gm", "no assistant", "public",],
    visibility: "public",
  },
];

/** Slug of the default template bound to auto-created location chats. */
export const WORLD_TEMPLATE_SLUG = "world";

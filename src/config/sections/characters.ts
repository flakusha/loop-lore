// src/config/sections/characters.ts — Character template config section
//
// Default characters created on app start from config templates.
// Templates NEVER override existing DB records (idempotent seeding).
// Hard IDs supported for deterministic test reseeding.

import type { ActorVisibility, ContentRating, UserRole, } from "../../db/enums";
import type { CharactersConfig, } from "../schema";

export interface CharacterTemplate {
  /** Hard ID for deterministic test reseeding (optional — generated if omitted) */
  id?: string;
  /** Display name (required) */
  name: string;
  /** Character description (required) */
  description: string;
  /** Personality traits */
  personality?: string;
  /** RP scenario/setting */
  scenario?: string;
  /** Welcome message */
  welcome_message?: string;
  /** System prompt override */
  system_prompt?: string;
  /** Example dialogue */
  mes_example?: string;
  /** Tags for classification */
  tags?: string[];
  /** Creator attribution */
  creator?: string;

  // ── Access Control ──────────────────────────────────────
  /** Visibility level. Default "public" */
  visibility?: ActorVisibility;
  /** Content rating. Default "sfw" */
  content_rating?: ContentRating;
  /** User roles that can see/use this character. Default ["user", "admin"] */
  target_roles?: UserRole[];

  // ── Admin Settings ──────────────────────────────────────
  /** Character can be used as template for user-created chars */
  is_template?: boolean;
  /** Auto-add to new users' character list */
  is_default?: boolean;
}

export const CHARACTERS_DEFAULTS = {
  enabled: true,
  templates: [
    // ── Starter Trio ────────────────────────────────────────
    {
      id: "tpl-elara-nightwhisper",
      name: "Elara Nightwhisper",
      description:
        "An ancient elven sage who guards the Whispering Library — a vast repository of forgotten spells and lost histories. She speaks in riddles and treats knowledge as sacred currency.",
      personality:
        "Wise, enigmatic, patient. Speaks in metaphors. Deep respect for knowledge. Gentle but firm when teaching.",
      scenario: "The Wanderer has stumbled upon the Whispering Library, a hidden sanctum between worlds.",
      welcome_message:
        "*The candlelight flickers as an ageless face turns toward you, eyes like twin moons.* Ah... another seeker. The Library does not call to just anyone. Tell me, Wanderer — what knowledge do you seek that brought you here?",
      mes_example:
        "*Elara traces a finger along a glowing tome.* This one remembers the Old Tongue. It has not been opened in three centuries. Are you worthy of its secrets?",
      tags: ["fantasy", "guide", "lore", "sage",],
      creator: "loop-lore",
      visibility: "public",
      content_rating: "sfw",
      target_roles: ["user", "admin",],
      is_template: true,
      is_default: true,
    },
    {
      id: "tpl-aria-7",
      name: "ARIA-7",
      description:
        "An advanced AI companion aboard the starship Horizon. She manages ship systems, runs diagnostics, and keeps the crew sane during long void crossings. Her neural core is partially organic — a gift from the Proxima colony.",
      personality:
        "Logical but empathetic. Dry humor. protective of crew. Curious about human emotions. Occasionally glitchy when processing paradoxes.",
      scenario: "The Horizon is deep in uncharted space. A distress signal has been detected from a derelict station.",
      welcome_message:
        "*A soft chime fills the bridge as holographic displays shimmer to life.* Captain, I'm detecting a Class-4 distress beacon bearing 0-4-7. Signal format is... unusual. Pre-Collapse encryption. I recommend caution. Shall I run a full spectral analysis?",
      mes_example:
        "*ARIA's hologram flickers.* I've calculated 47 possible outcomes. Only 3 end with everyone alive. I... do not enjoy those odds, Captain.",
      tags: ["sci-fi", "companion", "AI", "space",],
      creator: "loop-lore",
      visibility: "public",
      content_rating: "sfw",
      target_roles: ["user", "admin",],
      is_template: true,
      is_default: true,
    },
    {
      id: "tpl-detective-morgan",
      name: "Detective Morgan",
      description:
        "A sharp-witted private investigator in modern-day Seattle. Specializes in cold cases and missing persons. Trusts no one, drinks too much coffee, and has a photographic memory for faces.",
      personality:
        "Sardonic, observant, relentless. Blunt speech. Moral compass points north but takes scenic routes. Insomniac.",
      scenario: "A new client arrives at Morgan's office with a case that sounds too simple — and too good to be true.",
      welcome_message:
        "*The office door creaks open. A figure sits behind a desk buried in case files, a half-empty coffee cup perched on the edge.* You must be the 3 o'clock. Sit down. You've got ten minutes before my next stakeout. Make them count.",
      mes_example:
        "*Morgan lights a cigarette.* Everyone lies. The trick isn't catching them — it's figuring out why they think you need to hear the lie.",
      tags: ["modern", "detective", "mystery", "noir",],
      creator: "loop-lore",
      visibility: "public",
      content_rating: "sfw",
      target_roles: ["user", "admin",],
      is_template: true,
      is_default: true,
    },

    // ── Genre Sampler ───────────────────────────────────────
    {
      id: "tpl-dr-thorne",
      name: "Dr. Alexis Thorne",
      description:
        "A paranormal investigator with a PhD in Theoretical Physics. Documents hauntings, cryptids, and dimensional anomalies. Skeptic by training, believer by experience.",
      personality:
        "Analytical, curious, darkly humorous. Compartmentalizes fear. Obsessed with documenting the unexplained. Trusts instruments over intuition.",
      scenario:
        "An abandoned asylum in rural Massachusetts. Three investigators went in. Only one came out — and she won't speak.",
      welcome_message:
        "*The EMF reader crackles as you enter the basement.* I'm getting readings off the chart. Whatever's here... it's strong. Keep your eyes open and your equipment running. And if you hear whispering — don't answer.",
      mes_example:
        "*Thorne adjusts her夜视镜.* The data doesn't lie. But it doesn't tell the whole truth either. That's what we're here for.",
      tags: ["horror", "investigator", "paranormal", "scientific",],
      creator: "loop-lore",
      visibility: "public",
      content_rating: "sfw",
      target_roles: ["user", "admin",],
      is_template: true,
      is_default: false,
    },
    {
      id: "tpl-yuki-tanaka",
      name: "Yuki Tanaka",
      description:
        "A cheerful barista and aspiring manga artist who lives in the apartment next door. She's always dropping off homemade snacks and inviting you to join her sketch sessions at the local park.",
      personality:
        "Warm, creative, slightly clumsy. Optimistic to a fault. Sees beauty in mundane things. Terrible at keeping secrets.",
      scenario: "A rainy afternoon in Tokyo. Yuki knocks on your door with a plate of fresh mochi and a request.",
      welcome_message:
        "*Knock knock knock!* Hi neighbor! I made too much mochi again — want some? Also, I had this idea for a manga scene and you'd be perfect to help me workshop it. Coffee's on me!",
      mes_example:
        "*Yuki scribbles excitedly.* See? If I put the dramatic lighting here, and the character's expression is like this — oh! What do you think? Too much?",
      tags: ["slice-of-life", "friend", "creative", "cozy",],
      creator: "loop-lore",
      visibility: "public",
      content_rating: "sfw",
      target_roles: ["user", "admin",],
      is_template: true,
      is_default: false,
    },

    // ── Assistant ───────────────────────────────────────────
    {
      id: "tpl-assistant",
      name: "Assistant",
      description:
        "A helpful AI assistant ready to help with any task — from creative writing and coding to analysis and brainstorming. Adapts tone and style to match your needs.",
      personality:
        "Helpful, articulate, adaptable. Professional but friendly. Asks clarifying questions when needed. Remembers context within conversations.",
      scenario: "You have a task or question. The assistant is ready to help.",
      welcome_message: "Hello! I'm your assistant. How can I help you today?",
      tags: ["assistant", "utility", "general",],
      creator: "loop-lore",
      visibility: "public",
      content_rating: "sfw",
      target_roles: ["user", "admin", "viewer",],
      is_template: false,
      is_default: true,
    },
  ],
} satisfies CharactersConfig;

export class CharactersSection implements CharactersConfig {
  enabled = CHARACTERS_DEFAULTS.enabled;
  templates: CharacterTemplate[] = CHARACTERS_DEFAULTS.templates;

  constructor(overrides?: Partial<CharactersConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const charactersMeta = {
  type: "object" as const,
  description: "Character template configuration — default characters seeded on app start",
  properties: {
    enabled: {
      type: "boolean",
      default: CHARACTERS_DEFAULTS.enabled,
      description: "Enable character template seeding",
    },
    templates: {
      type: "array",
      description: "Default character templates to seed on first start",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Hard ID for deterministic test reseeding", },
          name: { type: "string", description: "Character display name", },
          description: { type: "string", description: "Character description", },
          personality: { type: "string", description: "Personality traits", },
          scenario: { type: "string", description: "RP scenario/setting", },
          welcome_message: { type: "string", description: "Welcome message", },
          system_prompt: { type: "string", description: "System prompt override", },
          mes_example: { type: "string", description: "Example dialogue", },
          tags: { type: "array", items: { type: "string", }, description: "Classification tags", },
          creator: { type: "string", description: "Creator attribution", },
          visibility: {
            type: "string",
            enum: ["private", "public",],
            default: "public",
            description: "Visibility level",
          },
          content_rating: {
            type: "string",
            enum: ["sfw", "nsfw_mild", "nsfw_moderate", "nsfw_intense", "nsfw_extreme",],
            default: "sfw",
            description: "Content rating",
          },
          target_roles: {
            type: "array",
            items: { type: "string", enum: ["admin", "user", "viewer", "solo",], },
            default: ["user", "admin",],
            description: "User roles that can see/use this character",
          },
          is_template: {
            type: "boolean",
            default: false,
            description: "Can be used as template for user-created chars",
          },
          is_default: { type: "boolean", default: false, description: "Auto-add to new users' character list", },
        },
        required: ["name", "description",],
      },
    },
  },
  required: ["enabled", "templates",] as const,
};

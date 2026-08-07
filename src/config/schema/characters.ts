// src/config/schema/characters.ts — Characters (template seeding) config type

export interface CharactersConfig {
  /** Enable character template seeding on app start. Default true. */
  enabled: boolean;
  /** Default character templates to seed. Never overrides existing DB records. */
  templates: {
    /** Hard ID for deterministic test reseeding (optional — generated if omitted) */
    id?: string;
    name: string;
    description: string;
    personality?: string;
    scenario?: string;
    welcome_message?: string;
    system_prompt?: string;
    mes_example?: string;
    tags?: string[];
    creator?: string;
    /** Identity — persisted as character_permanent_traits at seed time */
    species?: string;
    subrace?: string;
    gender?: string;
    age?: string | number;
    homeland?: string;
    culture?: string;
    /** Optional avatar for the seeded character (resolved at seed time) */
    avatar?: { type: "file"; path: string } | { type: "default" };
    /** Visibility level. Default "public" */
    visibility?: "private" | "public";
    /** Content rating. Default "sfw" */
    content_rating?: "sfw" | "nsfw_mild" | "nsfw_moderate" | "nsfw_intense" | "nsfw_extreme";
    /** User roles that can see/use this character. Default ["user", "admin"] */
    target_roles?: ("admin" | "user" | "viewer" | "solo")[];
    /** Character can be used as template for user-created chars */
    is_template?: boolean;
    /** Auto-add to new users' character list */
    is_default?: boolean;
  }[];
}

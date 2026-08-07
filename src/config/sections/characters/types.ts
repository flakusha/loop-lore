import type { ActorVisibility, ContentRating, UserRole, } from "../../../db/enums";

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

  // ── Identity ────────────────────────────────────────────
  /** Identity — persisted as character_permanent_traits at seed time */
  species?: string;
  subrace?: string;
  gender?: string;
  age?: string | number;
  homeland?: string;
  culture?: string;

  // ── Avatar ──────────────────────────────────────────────
  /** Optional avatar for the seeded character (resolved at seed time) */
  avatar?: { type: "file"; path: string } | { type: "default" };

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

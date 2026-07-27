/**
 * Character Specification — Unified Types
 *
 * Canonical character card types, extension interfaces,
 * multi-language support structures, and validation constants.
 *
 * This is the authoritative type definitions for the character
 * system. All normalizers, validators, and routes reference
 * these types.
 */

// ── Content Rating ──────────────────────────────────
export const ContentRating = {
  Sfw: "sfw",
  NsfwMild: "nsfw_mild",
  NsfwModerate: "nsfw_moderate",
  NsfwIntense: "nsfw_intense",
  NsfwExtreme: "nsfw_extreme",
} as const;
export type ContentRating = (typeof ContentRating)[keyof typeof ContentRating];

// ── Validation Mode ─────────────────────────────────
export const ValidationMode = {
  Strict: "strict",
  Relaxed: "relaxed",
} as const;
export type ValidationMode = (typeof ValidationMode)[keyof typeof ValidationMode];

// ── Review State ────────────────────────────────────
export const ReviewState = {
  Draft: "draft",
  PendingReview: "pending_review",
  Approved: "approved",
  Rejected: "rejected",
  Archived: "archived",
} as const;
export type ReviewState = (typeof ReviewState)[keyof typeof ReviewState];

// ── Review Role ─────────────────────────────────────
export const ReviewRole = {
  Admin: "admin",
  Moderator: "moderator",
  User: "user",
  LlMain: "llm_main",
  LlAux: "llm_aux",
  LlReview: "llm_review",
} as const;
export type ReviewRole = (typeof ReviewRole)[keyof typeof ReviewRole];

// ── Impersonation Context ───────────────────────────
export const ImpersonationContext = {
  PrivateChat: "private_chat",
  GroupChat: "group_chat",
} as const;
export type ImpersonationContext = (typeof ImpersonationContext)[keyof typeof ImpersonationContext];

// ── Migration Status ────────────────────────────────
export const MigrationStatus = {
  Ready: "migration-ready",
  Partial: "migration-partial",
  Blocked: "migration-blocked",
  Complete: "migration-complete",
} as const;
export type MigrationStatus = (typeof MigrationStatus)[keyof typeof MigrationStatus];

// ── Storage Format ──────────────────────────────────
export const StorageFormat = {
  Json: "json",
  Yaml: "yaml",
  Toml: "toml",
} as const;
export type StorageFormat = (typeof StorageFormat)[keyof typeof StorageFormat];

// ── Import Format ───────────────────────────────────
export const ImportFormat = {
  Ccv2: "ccv2",
  Ccv3: "ccv3",
  CharacterAi: "character-ai",
  JsonFlat: "json-flat",
  Yaml: "yaml",
  Toml: "toml",
  PngV2: "png-v2",
  PngV3: "png-v3",
  Charx: "charx",
} as const;
export type ImportFormat = (typeof ImportFormat)[keyof typeof ImportFormat];

// ── Export Format ───────────────────────────────────
export const ExportFormat = {
  Json: "json",
  Ccv2: "ccv2",
  Ccv3: "ccv3",
  Yaml: "yaml",
  Toml: "toml",
  Png: "png",
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

// ── Character Relationship Types ────────────────────
export const CharacterRelationshipType = {
  Friend: "friend",
  Rival: "rival",
  Ally: "ally",
  Enemy: "enemy",
  Family: "family",
  Mentor: "mentor",
  Student: "student",
  Neutral: "neutral",
} as const;
export type CharacterRelationshipType = (typeof CharacterRelationshipType)[keyof typeof CharacterRelationshipType];

// ── World Modifier Types ────────────────────────────
export const WorldModifierType = {
  Speech: "speech",
  Behavior: "behavior",
  Emotional: "emotional",
  Social: "social",
  QuirkSuppression: "quirk_suppression",
} as const;
export type WorldModifierType = (typeof WorldModifierType)[keyof typeof WorldModifierType];

// ── World Validation ────────────────────────────────
export interface WorldValidationRules {
  world_id: string;
  allowed_content_ratings: ContentRating[];
  max_description_length: number;
  required_fields: string[];
  forbidden_tags: string[];
  custom_validators?: CustomValidator[];
}

export interface CustomValidator {
  field: string;
  rule: string;
  message: string;
  params?: Record<string, unknown>;
}

// ── World Style Rules ───────────────────────────────
export interface WorldStyleRules {
  world_id: string;
  speech_style: "formal" | "informal" | "neutral" | "custom";
  allowed_personality_traits?: string[];
  forbidden_personality_traits?: string[];
  expression_modifiers?: Record<string, unknown>;
}

// ── Feature Flags ───────────────────────────────────
export interface CharacterFeatureFlags {
  rpg_mechanics?: boolean;
  inventory?: boolean;
  relationships?: boolean;
  mood?: boolean;
  traits?: boolean;
  lorebook?: boolean;
  assets?: boolean;
  nsfw?: boolean;
}

// ── Inventory ────────────────────────────────────────
export interface InventoryItem {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
  equipped: boolean;
  metadata?: Record<string, unknown>;
}

// ── Character Relationship ───────────────────────────
export interface CharacterRelationship {
  target_character_id: string;
  type: CharacterRelationshipType;
  strength: number;
  notes: string;
}

// ── World Modifier ───────────────────────────────────
export interface WorldModifier {
  world_id: string;
  type: WorldModifierType;
  description: string;
  active: boolean;
}

// ── Locale Config ────────────────────────────────────
export interface LocaleConfig {
  default_locale: string;
  supported_locales: string[];
  fallback_locale: string;
}

// ── Localized Fields ─────────────────────────────────
export interface LocalizedFields {
  name?: Record<string, string>;
  description?: Record<string, string>;
  personality?: Record<string, string>;
  scenario?: Record<string, string>;
  welcome_message?: Record<string, string>;
  mes_example?: Record<string, string>;
  system_prompt?: Record<string, string>;
  post_history_instructions?: Record<string, string>;
  alternate_greetings?: Record<string, string[]>;
  creator_notes?: Record<string, string>;
}

// ── Character Extensions ─────────────────────────────
export interface CharacterExtensions {
  stats?: Record<string, number>;
  inventory?: InventoryItem[];
  relationships?: CharacterRelationship[];
  world_modifiers?: WorldModifier[];
  plugin_bundle?: string;
  feature_flags?: CharacterFeatureFlags;
  translations?: LocalizedFields;
  [key: string]: unknown;
}

// ── Canonical Character ──────────────────────────────
export interface CanonicalCharacter {
  name: string;
  description: string;
  personality: string;
  scenario?: string;
  welcome_message?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  creator_notes?: string;
  character_version?: string;
  nickname?: string | null;
  content_rating?: ContentRating;
  nsfw_categories?: string[];
  nsfw_hard_limits?: string[];
  lorebook?: LorebookData;
  assets?: CharacterAsset[];
  extensions?: CharacterExtensions;
}

// ── Character with Metadata ──────────────────────────
export interface CharacterRecord extends CanonicalCharacter {
  id: string;
  owner_id: string;
  user_id: string | null;
  actor_type: string;
  display_name: string;
  visibility: string;
  content_rating: ContentRating;
  review_state: ReviewState;
  storage_format: StorageFormat;
  data_source_format: StorageFormat;
  data_json: string;
  data_yaml: string | null;
  data_toml: string | null;
  import_format: ImportFormat | null;
  import_source: string | null;
  migration_status: MigrationStatus;
  migration_from_version: string | null;
  migration_to_version: string;
  allowed_age: number | null;
  created_at: string;
  updated_at: string;
}

// ── Review Entry ─────────────────────────────────────
export interface ReviewEntry {
  id: string;
  character_id: string;
  reviewer_role: ReviewRole;
  reviewer_id: string;
  from_state: ReviewState;
  to_state: ReviewState;
  feedback: string | null;
  confidence: number | null;
  created_at: string;
}

// ── Import Job ───────────────────────────────────────
export interface ImportJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  format: ImportFormat;
  character_id: string | null;
  warnings: string[];
  errors: string[];
  created_at: string;
  completed_at: string | null;
}

// ── Validation Result ────────────────────────────────
export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value: unknown;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  value: unknown;
}

// ── Lorebook ──────────────────────────────────
export interface LorebookData {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  entries: LorebookEntry[];
}

export interface LorebookEntry {
  keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  name: string;
  priority: number;
  id: number;
  comment?: string;
  selective: boolean;
  constant: boolean;
  position: "before_char" | "after_char";
  use_regex?: boolean;
  extensions?: Record<string, unknown>;
}

// ── Character Asset ───────────────────────────
export interface CharacterAsset {
  type: string;
  name: string;
  uri: string;
  ext: string;
  data?: Buffer; // For CHARX imports
}

// ── Parse Result ──────────────────────────────
export type CharacterFormat =
  | "ccv2"
  | "ccv3"
  | "character-ai"
  | "json-flat"
  | "yaml"
  | "toml"
  | "png-v2"
  | "png-v3"
  | "charx";

export interface ParseResult {
  character: CanonicalCharacter;
  format: CharacterFormat;
  warnings: string[];
}

export interface ParseError {
  code:
    | "FORMAT_NOT_DETECTED"
    | "PARSE_ERROR"
    | "VALIDATION_ERROR"
    | "UNSUPPORTED_VERSION"
    | "FILE_READ_ERROR";
  message: string;
  details?: {
    line?: number;
    column?: number;
    field?: string;
    expected?: string;
    actual?: string;
  };
  suggestion?: string;
}

// ── Plugin Bundle ────────────────────────────────────
export interface PluginBundle {
  id: string;
  name: string;
  version: string;
  description?: string;
  stats: BundleStat[];
  skills: BundleSkill[];
  actions: BundleAction[];
}

export interface BundleStat {
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  default: number;
}

export interface BundleSkill {
  name: string;
  label: string;
  description: string;
  stat: string;
  level_cap: number;
}

export interface BundleAction {
  name: string;
  label: string;
  description: string;
  requires: string[];
  damage_stat?: string;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Centralized Regex Patterns
 *
 * All compiled regex patterns used across the codebase, organized by domain.
 * Import from this module or directly from the specific sub-module.
 *
 * @module regex
 */

export {
  COMMAND_PATTERNS,
  type CommandIntent,
  TAG_BACKGROUND,
  TAG_FACE,
  TAG_OBJECT,
} from "./image-edit";

export {
  type AssistantIntent,
  INTENT_PATTERNS,
  REGEX_SPECIAL_CHARS,
  SLASH_COMMAND,
} from "./intent";

export {
  ENTITY_PATTERN,
  EPISODIC_ACTION,
  EPISODIC_TEMPORAL,
  IMPORTANCE_DECISION,
  IMPORTANCE_EMOTION,
  KEYWORD_ACTION_VERBS,
  KEYWORD_PROPER_NOUN,
  PROCEDURAL_LEARNING,
  PROCEDURAL_PREFERENCE,
} from "./memory-classification";

export {
  CONTEXT_CUT,
  MOVEMENT_VERBS,
  SCENE_CHANGE,
  TEMPORAL_TRANSITION,
  TRANSITION_PHRASES,
} from "./transitions";

export {
  ITEM_INDICATORS,
  LOCATION_INDICATORS,
  WORLD_INDICATORS,
} from "./hallucination";

export { EXTERNAL_MUSIC_PATTERNS, } from "./music-urls";

export {
  HASH_INJECTION_LINK,
  HASH_INJECTION_SCRIPT,
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  SCRIPT_TAG,
} from "./html-sanitize";

// ── Story Events ─────────────────────────────────────────────

export {
  COMBAT_ACTION,
  COMBAT_DAMAGE,
  COMBAT_PATTERNS,
  ITEM_DROP,
  ITEM_GIVE,
  ITEM_PATTERNS,
  ITEM_TAKE,
  LOCATION_MOVEMENT,
  LOCATION_PATTERNS,
  LOCATION_TRAVEL,
  LORE_ANCIENT,
  LORE_PATTERNS,
  LORE_REVELATION,
  NPC_DISPOSITION,
  NPC_PATTERNS,
  NPC_REVELATION,
  NPC_STATE,
  TIME_CELESTIAL,
  TIME_HOURS,
  TIME_NEXT_PERIOD,
  TIME_PATTERNS,
} from "./story-events";

// ── Template Rendering ───────────────────────────────────────

export {
  HTML_EXTENSION,
  I18N_DIRECTIVE,
  ICON_DIRECTIVE,
  INCLUDE_DIRECTIVE,
  TITLE_TAG,
} from "./template";

// ── Narrative Quality ────────────────────────────────────────

export {
  ACTION_MARKER,
  DIALOGUE_QUOTES,
  FIRST_PERSON,
  PAST_VERBS,
  PRESENT_VERBS,
  PROPER_NOUN,
  PROPER_NOUN_ENTITY,
  SENTENCE_END,
} from "./narrative";

// ── Cookie Parsing ───────────────────────────────────────────

export { CSRF_TOKEN, LL_LOCALE, LL_TOKEN, } from "./cookies";

// ── Slugification / Sanitization ─────────────────────────────

export {
  DOUBLE_SPACES,
  FILENAME_SAFE,
  GITDIR_LINE,
  GREETING_FILLER,
  HASH_FILENAME,
  HASHED_ASSET,
  KEYWORD_SPLIT,
  MODEL_SIZE,
  PROPER_NOUN_EXTRACT,
  REMOVE_COLON_DATA_TESTID,
  REMOVE_DATA_TESTID,
  REMOVE_SVG_CLASS,
  SLUG_SAFE,
  SPACE_BEFORE_PUNCT,
  STRIP_HTML_TAGS,
  STRIP_QUOTES,
} from "./slugs";

// ── Commit / Semver ──────────────────────────────────────────

export { CONVENTIONAL_COMMIT, RELEASE_BRANCH, SEMVER, } from "./commit";

// ── Dice Notation ────────────────────────────────────────────

export { DICE_EXTENDED, DICE_ROLL_EXTRACT, DICE_SIMPLE, } from "./dice";

// ── Code Fences / JSON ───────────────────────────────────────

export { CODE_FENCE_JSON, FENCE_OPEN, JSON_ARRAY, } from "./code-fence";

// ── Placeholders / i18n ──────────────────────────────────────

export {
  DOUBLE_BRACE,
  MENTION,
  MENTION_AT_END,
  OBJECT_TYPE,
  SINGLE_BRACE,
  WORKFLOW_TAG,
} from "./placeholders";

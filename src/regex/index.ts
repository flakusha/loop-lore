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
  TAG_FACE,
  TAG_BACKGROUND,
  TAG_OBJECT,
  type CommandIntent,
} from "./image-edit";

export {
  INTENT_PATTERNS,
  SLASH_COMMAND,
  REGEX_SPECIAL_CHARS,
  type AssistantIntent,
} from "./intent";

export {
  EPISODIC_TEMPORAL,
  EPISODIC_ACTION,
  PROCEDURAL_PREFERENCE,
  PROCEDURAL_LEARNING,
  IMPORTANCE_DECISION,
  IMPORTANCE_EMOTION,
  ENTITY_PATTERN,
  KEYWORD_PROPER_NOUN,
  KEYWORD_ACTION_VERBS,
} from "./memory-classification";

export {
  MOVEMENT_VERBS,
  SCENE_CHANGE,
  TRANSITION_PHRASES,
  TEMPORAL_TRANSITION,
  CONTEXT_CUT,
} from "./transitions";

export {
  LOCATION_INDICATORS,
  ITEM_INDICATORS,
  WORLD_INDICATORS,
} from "./hallucination";

export { EXTERNAL_MUSIC_PATTERNS } from "./music-urls";

export {
  SCRIPT_TAG,
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  HASH_INJECTION_SCRIPT,
  HASH_INJECTION_LINK,
} from "./html-sanitize";

// ── Story Events ─────────────────────────────────────────────

export {
  LOCATION_MOVEMENT,
  LOCATION_TRAVEL,
  LOCATION_PATTERNS,
  TIME_HOURS,
  TIME_CELESTIAL,
  TIME_NEXT_PERIOD,
  TIME_PATTERNS,
  COMBAT_ACTION,
  COMBAT_DAMAGE,
  COMBAT_PATTERNS,
  NPC_STATE,
  NPC_DISPOSITION,
  NPC_REVELATION,
  NPC_PATTERNS,
  ITEM_GIVE,
  ITEM_TAKE,
  ITEM_DROP,
  ITEM_PATTERNS,
  LORE_REVELATION,
  LORE_ANCIENT,
  LORE_PATTERNS,
} from "./story-events";

// ── Template Rendering ───────────────────────────────────────

export {
  TITLE_TAG,
  INCLUDE_DIRECTIVE,
  ICON_DIRECTIVE,
  I18N_DIRECTIVE,
  HTML_EXTENSION,
} from "./template";

// ── Narrative Quality ────────────────────────────────────────

export {
  DIALOGUE_QUOTES,
  PAST_VERBS,
  PRESENT_VERBS,
  ACTION_MARKER,
  FIRST_PERSON,
  PROPER_NOUN,
  PROPER_NOUN_ENTITY,
  SENTENCE_END,
} from "./narrative";

// ── Cookie Parsing ───────────────────────────────────────────

export { LL_TOKEN, LL_LOCALE, CSRF_TOKEN } from "./cookies";

// ── Slugification / Sanitization ─────────────────────────────

export {
  SLUG_SAFE,
  FILENAME_SAFE,
  STRIP_QUOTES,
  STRIP_HTML_TAGS,
  DOUBLE_SPACES,
  SPACE_BEFORE_PUNCT,
  REMOVE_DATA_TESTID,
  REMOVE_COLON_DATA_TESTID,
  REMOVE_SVG_CLASS,
  GITDIR_LINE,
  MODEL_SIZE,
  HASHED_ASSET,
  HASH_FILENAME,
  KEYWORD_SPLIT,
  GREETING_FILLER,
  PROPER_NOUN_EXTRACT,
} from "./slugs";

// ── Commit / Semver ──────────────────────────────────────────

export { CONVENTIONAL_COMMIT, SEMVER, RELEASE_BRANCH } from "./commit";

// ── Dice Notation ────────────────────────────────────────────

export { DICE_SIMPLE, DICE_EXTENDED, DICE_ROLL_EXTRACT } from "./dice";

// ── Code Fences / JSON ───────────────────────────────────────

export { CODE_FENCE_JSON, JSON_ARRAY, FENCE_OPEN } from "./code-fence";

// ── Placeholders / i18n ──────────────────────────────────────

export {
  DOUBLE_BRACE,
  SINGLE_BRACE,
  WORKFLOW_TAG,
  MENTION,
  MENTION_AT_END,
  OBJECT_TYPE,
} from "./placeholders";

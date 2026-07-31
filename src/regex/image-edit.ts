/**
 * Image Edit Command Patterns
 *
 * Compiled regex patterns for NL command intent detection.
 * Extracted from image-edit-commands.ts for centralized management
 * and unit testing.
 *
 * @module regex/image-edit
 */

/** Command intent types */
export type CommandIntent =
  | "modify_background"
  | "add_object"
  | "remove_object"
  | "change_appearance"
  | "apply_style"
  | "adjust_mood"
  | "change_hair"
  | "change_outfit"
  | "add_accessory"
  | "change_lighting"
  | "change_pose"
  | "composite"
  | "inpaint"
  | "upscale"
  | "unknown";

// ── Command Patterns ──────────────────────────────────────

/**
 * Pattern definitions for command intent detection.
 * Each intent maps to one or more regex patterns that match NL commands.
 */
export const COMMAND_PATTERNS: readonly {
  readonly intent: CommandIntent;
  readonly patterns: readonly RegExp[];
  readonly confidence: number;
}[] = [
  {
    intent: "modify_background",
    patterns: [
      /(?:make|change|replace|swap)\s+(?:the\s+)?(?:background|bg|back(?:ground)?)/i,
      /(?:new|different)\s+(?:background|bg)/i,
      /(?:remove|clear)\s+(?:the\s+)?(?:background|bg)/i,
      /(?:set|put)\s+(?:the\s+)?(?:background|bg)\s+(?:to|as)\s+(.+)/i,
    ],
    confidence: 0.9,
  },
  {
    intent: "add_object",
    patterns: [
      /(?:add|place|put|insert)\s+(?:a\s+)?(.+?)(?:\s+(?:to|on|in|at|into|onto)\s+(.+))?$/i,
      /(?:put|place)\s+(?:a\s+)?(.+?)\s+(?:in|on|at|near)\s+(?:the\s+)?(.+)/i,
    ],
    confidence: 0.85,
  },
  {
    intent: "remove_object",
    patterns: [
      /(?:remove|delete|erase|get rid of)\s+(?:the\s+)?(.+)/i,
      /(?:take out|take away)\s+(?:the\s+)?(.+)/i,
    ],
    confidence: 0.9,
  },
  {
    intent: "change_appearance",
    patterns: [
      /(?:make|change|turn)\s+(?:the\s+)?(.+?)\s+(?:more|less|bigger|smaller|taller|shorter)/i,
      /(?:change|alter|modify)\s+(?:the\s+)?(.+?)\s+(?:to|into)\s+(.+)/i,
      /(?:give|add)\s+(?:the\s+)?(.+?)\s+(?:a\s+)?(.+)/i,
    ],
    confidence: 0.8,
  },
  {
    intent: "apply_style",
    patterns: [
      /(?:apply|use|try)\s+(.+?)\s+style/i,
      /(?:make it look like|in the style of)\s+(.+)/i,
      /(?:paint|draw|render)\s+(?:it\s+)?(?:in|like|as)\s+(.+)/i,
    ],
    confidence: 0.85,
  },
  {
    intent: "adjust_mood",
    patterns: [
      /(?:make|look|seem)\s+(.+?)\s+(?:more|less)?\s*(happy|sad|angry|scared|surprised|calm|excited|anxious)/i,
      /(?:change|set)\s+(?:the\s+)?(?:mood|emotion|expression)\s+(?:to|to)\s+(.+)/i,
      /(?:add|apply)\s+(.+?)\s+(?:expression|mood)/i,
    ],
    confidence: 0.85,
  },
  {
    intent: "change_hair",
    patterns: [
      /(?:change|make|color|dye)\s+(?:the\s+)?(?:hair|hairstyle)\s+(?:to\s+)?(.+)/i,
      /(?:give|put)\s+(?:the\s+)?(.+?)\s+(?:a\s+)?(.+?)\s+(?:hair|hairstyle)/i,
      /(?:long|short|curly|straight|wavy|braided|ponytail|bun)\s+(?:hair|hairstyle)/i,
    ],
    confidence: 0.9,
  },
  {
    intent: "change_outfit",
    patterns: [
      /(?:change|put on|wear|dress)\s+(?:the\s+)?(?:in\s+)?(.+)/i,
      /(?:give|put)\s+(?:the\s+)?(.+?)\s+(?:a\s+)?(.+?)\s+(?:outfit|clothes|dress)/i,
      /(?:change|swap)\s+(?:the\s+)?(?:outfit|clothes|dress|costume)/i,
    ],
    confidence: 0.9,
  },
  {
    intent: "add_accessory",
    patterns: [
      /(?:add|put on|give)\s+(?:a\s+)?(.+?)(?:\s+(?:to|on|for)\s+(.+))?$/i,
      /(?:wear|with)\s+(?:a\s+)?(.+?)(?:\s+(?:on|around|over)\s+(.+))?$/i,
    ],
    confidence: 0.7,
  },
  {
    intent: "change_lighting",
    patterns: [
      /(?:change|set|adjust)\s+(?:the\s+)?(?:lighting|light|lights)\s+(?:to\s+)?(.+)/i,
      /(?:make it look|look)\s+(.+?)\s+(?:lit|illuminated|bright|dim|dark)/i,
      /(?:add|put)\s+(.+?)\s+(?:light|lighting)/i,
    ],
    confidence: 0.85,
  },
  {
    intent: "change_pose",
    patterns: [
      /(?:change|set|put)\s+(?:the\s+)?(?:pose|position|stance)\s+(?:to\s+)?(.+)/i,
      /(?:make|have)\s+(?:the\s+)?(.+?)\s+(?:stand|sit|lie|run|walk|jump|fight|cast|hold)/i,
      /(?:standing|sitting|lying|running|walking|jumping|fighting|casting|holding)/i,
    ],
    confidence: 0.8,
  },
  {
    intent: "upscale",
    patterns: [
      /(?:upscale|enlarge|increase|improve)\s+(?:the\s+)?(?:resolution|quality|detail)/i,
      /(?:make|get)\s+(?:it\s+)?(?:bigger|larger|higher(?:er)?\s+resolution)/i,
      /(?:4k|8k|hd|high(?:er)?\s+(?:resolution|quality))/i,
    ],
    confidence: 0.9,
  },
] as const;

// ── Tag Matching Patterns ─────────────────────────────────

/** Match tags indicating a face/portrait in image */
export const TAG_FACE = /face|portrait|person/i;

/** Match tags indicating a background/scene */
export const TAG_BACKGROUND = /background|scene|environment/i;

/** Match tags indicating an object/prop */
export const TAG_OBJECT = /object|item|prop/i;

/**
 * Image Edit Command Templates
 *
 * Text-based command templates for image editing operations.
 * Users issue natural language commands that map to Stable Diffusion/ComfyUI
 * img2img operations with appropriate ControlNet/IP-Adapter settings.
 *
 * Features:
 * - Command parser for image editing intents
 * - Template system for common edit operations
 * - Integration with generation pipeline
 * - Undo/redo support for edit chains
 *
 * @module generation/image-edit-commands
 */

import type { CommandIntent, } from "../regex/image-edit";

import { COMMAND_PATTERNS, TAG_BACKGROUND, TAG_FACE, TAG_OBJECT, } from "../regex/image-edit";
export type { CommandIntent, } from "../regex/image-edit";

/** Parsed command result */
export interface ParsedCommand {
  intent: CommandIntent;
  confidence: number;
  originalText: string;
  parameters: Record<string, string>;
  template?: EditTemplate;
}

/** Edit template definition */
export interface EditTemplate {
  id: string;
  name: string;
  intent: CommandIntent;
  /** Prompt modifier for the edit */
  promptModifier: string;
  /** Negative prompt to apply */
  negativePrompt?: string;
  /** Denoising strength (0-1, higher = more change) */
  denoisingStrength: number;
  /** ControlNet type to use */
  controlNet?: ControlNetType;
  /** IP-Adapter strength */
  ipAdapterStrength?: number;
  /** Steps override */
  steps?: number;
  /** CFG scale override */
  cfgScale?: number;
}

/** ControlNet types */
export type ControlNetType =
  | "canny"
  | "depth"
  | "pose"
  | "lineart"
  | "scribble"
  | "segmentation"
  | "normal"
  | "tile"
  | "ip2p"
  | "inpaint";

/** Edit chain entry for undo/redo */
export interface EditChainEntry {
  id: string;
  command: ParsedCommand;
  assetId: string;
  resultAssetId?: string;
  timestamp: string;
  status: "pending" | "applied" | "undone" | "failed";
  error?: string;
}

/** Edit history for an asset */
export interface EditHistory {
  assetId: string;
  entries: EditChainEntry[];
  currentEntryIndex: number;
}

// ── Edit Templates ────────────────────────────────────────

/** Predefined edit templates for common operations */
export const EDIT_TEMPLATES: EditTemplate[] = [
  // Background modifications
  {
    id: "bg-blur",
    name: "Blur Background",
    intent: "modify_background",
    promptModifier: "bokeh background, blurred background, depth of field",
    negativePrompt: "sharp background, flat",
    denoisingStrength: 0.6,
    controlNet: "depth",
  },
  {
    id: "bg-replace",
    name: "Replace Background",
    intent: "modify_background",
    promptModifier: "new background, detailed environment",
    negativePrompt: "original background",
    denoisingStrength: 0.85,
    controlNet: "segmentation",
  },
  {
    id: "bg-remove",
    name: "Remove Background",
    intent: "modify_background",
    promptModifier: "transparent background, isolated subject",
    denoisingStrength: 0.7,
    controlNet: "segmentation",
  },

  // Object operations
  {
    id: "obj-add",
    name: "Add Object",
    intent: "add_object",
    promptModifier: "added object, natural placement",
    denoisingStrength: 0.5,
    controlNet: "inpaint",
  },
  {
    id: "obj-remove",
    name: "Remove Object",
    intent: "remove_object",
    promptModifier: "clean background, removed object",
    denoisingStrength: 0.7,
    controlNet: "inpaint",
  },

  // Appearance changes
  {
    id: "hair-color",
    name: "Change Hair Color",
    intent: "change_hair",
    promptModifier: "colored hair, vibrant hair",
    denoisingStrength: 0.4,
    controlNet: "segmentation",
  },
  {
    id: "hair-style",
    name: "Change Hairstyle",
    intent: "change_hair",
    promptModifier: "new hairstyle, styled hair",
    denoisingStrength: 0.5,
    controlNet: "segmentation",
  },
  {
    id: "outfit-change",
    name: "Change Outfit",
    intent: "change_outfit",
    promptModifier: "new outfit, detailed clothing",
    denoisingStrength: 0.6,
    controlNet: "segmentation",
  },
  {
    id: "accessory-add",
    name: "Add Accessory",
    intent: "add_accessory",
    promptModifier: "with accessory, detailed",
    denoisingStrength: 0.35,
    controlNet: "inpaint",
  },

  // Mood/Expression
  {
    id: "mood-happy",
    name: "Happy Expression",
    intent: "adjust_mood",
    promptModifier: "happy expression, smiling, cheerful",
    denoisingStrength: 0.3,
    controlNet: "ip2p",
    ipAdapterStrength: 0.6,
  },
  {
    id: "mood-sad",
    name: "Sad Expression",
    intent: "adjust_mood",
    promptModifier: "sad expression, melancholy, downcast eyes",
    denoisingStrength: 0.3,
    controlNet: "ip2p",
    ipAdapterStrength: 0.6,
  },
  {
    id: "mood-angry",
    name: "Angry Expression",
    intent: "adjust_mood",
    promptModifier: "angry expression, furrowed brow, intense",
    denoisingStrength: 0.3,
    controlNet: "ip2p",
    ipAdapterStrength: 0.6,
  },

  // Lighting
  {
    id: "light-warm",
    name: "Warm Lighting",
    intent: "change_lighting",
    promptModifier: "warm lighting, golden hour, soft glow",
    denoisingStrength: 0.4,
    controlNet: "ip2p",
  },
  {
    id: "light-cold",
    name: "Cold Lighting",
    intent: "change_lighting",
    promptModifier: "cool lighting, blue tones, moonlight",
    denoisingStrength: 0.4,
    controlNet: "ip2p",
  },
  {
    id: "light-dramatic",
    name: "Dramatic Lighting",
    intent: "change_lighting",
    promptModifier: "dramatic lighting, rim light, cinematic",
    denoisingStrength: 0.45,
    controlNet: "ip2p",
  },

  // Styles
  {
    id: "style-anime",
    name: "Anime Style",
    intent: "apply_style",
    promptModifier: "anime style, cel shaded, vibrant colors",
    denoisingStrength: 0.6,
    controlNet: "canny",
  },
  {
    id: "style-realistic",
    name: "Realistic Style",
    intent: "apply_style",
    promptModifier: "photorealistic, detailed, high quality",
    denoisingStrength: 0.5,
    controlNet: "canny",
  },
  {
    id: "style-painting",
    name: "Painting Style",
    intent: "apply_style",
    promptModifier: "oil painting, painterly, art style",
    denoisingStrength: 0.6,
    controlNet: "canny",
  },

  // Pose
  {
    id: "pose-standing",
    name: "Standing Pose",
    intent: "change_pose",
    promptModifier: "standing pose, upright stance",
    denoisingStrength: 0.5,
    controlNet: "pose",
  },
  {
    id: "pose-sitting",
    name: "Sitting Pose",
    intent: "change_pose",
    promptModifier: "sitting pose, relaxed posture",
    denoisingStrength: 0.5,
    controlNet: "pose",
  },

  // Quality
  {
    id: "upscale-2x",
    name: "Upscale 2x",
    intent: "upscale",
    promptModifier: "high resolution, detailed, sharp",
    denoisingStrength: 0.2,
    controlNet: "tile",
    steps: 30,
  },
];

// ── Command Parser ────────────────────────────────────────

/**
 * Parse a natural language image editing command.
 *
 * @param text - User command text
 * @returns Parsed command with intent and parameters
 */
export function parseEditCommand(text: string,): ParsedCommand {
  const normalizedText = text.trim();

  let bestMatch: ParsedCommand = {
    intent: "unknown",
    confidence: 0,
    originalText: normalizedText,
    parameters: {},
  };

  for (const { intent, patterns, confidence, } of COMMAND_PATTERNS) {
    for (const pattern of patterns) {
      const match = normalizedText.match(pattern,);
      if (match && confidence > bestMatch.confidence) {
        const parameters: Record<string, string> = {};

        // Extract captured groups as parameters
        if (match[1]) { parameters.target = match[1].trim(); }
        if (match[2]) { parameters.location = match[2].trim(); }
        if (match[3]) { parameters.value = match[3].trim(); }

        // Find best matching template
        const template = findBestTemplate(intent, normalizedText, parameters,);

        bestMatch = {
          intent,
          confidence,
          originalText: normalizedText,
          parameters,
          template,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Find the best matching template for a command.
 */
function findBestTemplate(
  intent: CommandIntent,
  text: string,
  _parameters: Record<string, string>,
): EditTemplate | undefined {
  const intentTemplates: EditTemplate[] = [];
  for (const t of EDIT_TEMPLATES) { if (t.intent === intent) { intentTemplates.push(t,); } }

  if (intentTemplates.length === 0) {
    return undefined;
  }

  // Try to match specific keywords
  const lowerText = text.toLowerCase();

  for (const template of intentTemplates) {
    const templateWords = template.name.toLowerCase().split(/\s+/,);
    let matchCount = 0;
    for (const w of templateWords) { if (lowerText.includes(w,)) { matchCount += 1; } }

    if (matchCount > 0) {
      return template;
    }
  }

  // Return first template for the intent as fallback
  return intentTemplates[0];
}

/**
 * Get available templates for an intent.
 *
 * @param intent - Command intent
 * @returns Array of matching templates
 */
export function getTemplatesForIntent(intent: CommandIntent,): EditTemplate[] {
  const out: EditTemplate[] = [];
  for (const t of EDIT_TEMPLATES) { if (t.intent === intent) { out.push(t,); } }
  return out;
}

/**
 * Get a template by ID.
 *
 * @param templateId - Template ID
 * @returns Template or undefined
 */
export function getTemplateById(templateId: string,): EditTemplate | undefined {
  return EDIT_TEMPLATES.find((t,) => t.id === templateId);
}

/**
 * Get all available command intents.
 *
 * @returns Array of intent descriptions
 */
export function getAvailableIntents(): {
  intent: CommandIntent;
  description: string;
  templateCount: number;
}[] {
  const intents = new Map<CommandIntent, number>();

  for (const template of EDIT_TEMPLATES) {
    intents.set(template.intent, (intents.get(template.intent,) ?? 0) + 1,);
  }

  return Array.from(intents, ([intent, count,],) => ({
    intent,
    description: INTENT_DESCRIPTIONS[intent] ?? intent,
    templateCount: count,
  }),);
}

/** Intent descriptions for UI display */
const INTENT_DESCRIPTIONS: Record<CommandIntent, string> = {
  modify_background: "Change or remove the background",
  add_object: "Add a new object to the image",
  remove_object: "Remove an object from the image",
  change_appearance: "Modify appearance attributes",
  apply_style: "Apply an artistic style",
  adjust_mood: "Change facial expression or mood",
  change_hair: "Modify hair color or style",
  change_outfit: "Change clothing or outfit",
  add_accessory: "Add accessories (jewelry, hats, etc.)",
  change_lighting: "Adjust lighting conditions",
  change_pose: "Change character pose or stance",
  composite: "Combine multiple images",
  inpaint: "Fill in or modify a region",
  upscale: "Increase resolution or quality",
  unknown: "Unrecognized command",
};

/**
 * Suggest edits based on image content analysis.
 *
 * @param tags - Image tags from analysis
 * @returns Suggested edit commands
 */
export function suggestEdits(tags: string[],): string[] {
  const suggestions: string[] = [];

  // Check for common patterns
  const hasFace = tags.some((t,) => TAG_FACE.test(t,));
  const hasBackground = tags.some((t,) => TAG_BACKGROUND.test(t,));
  const hasObject = tags.some((t,) => TAG_OBJECT.test(t,));

  if (hasFace) {
    suggestions.push("Make them smile", "Change hair color", "Add glasses",);
  }

  if (hasBackground) {
    suggestions.push("Blur the background", "Replace background", "Change lighting",);
  }

  if (hasObject) {
    suggestions.push("Remove the object", "Make it bigger",);
  }

  // Always suggest upscale
  suggestions.push("Upscale to 4K",);

  return suggestions;
}

// ── Command Parser ────────────────────────────────────────

import type { CommandIntent, } from "../../regex/image-edit";
import { COMMAND_PATTERNS, TAG_BACKGROUND, TAG_FACE, TAG_OBJECT, } from "../../regex/image-edit";
import { EDIT_TEMPLATES, } from "./templates";
import type { EditTemplate, ParsedCommand, } from "./types";

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

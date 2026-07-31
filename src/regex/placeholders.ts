/**
 * Placeholder and i18n Regex Patterns
 *
 * Patterns for template variable substitution and i18n interpolation.
 *
 * Sources: src/generation/workflow-substitutor.ts, src/frontend/i18n.ts,
 *          src/frontend/ui.ts, src/i18n/translator.ts,
 *          src/frontend/vn/templates/template-engine.ts
 */

/** Match {{variable}} or {{path.to.field}} placeholders */
export const DOUBLE_BRACE = /\{\{([^}]+)\}\}/g;

/** Match {variable} placeholders (single brace) */
export const SINGLE_BRACE = /\{(\w+)\}/g;

/** Match workflow tags: kind:modality (e.g., character:image) */
export const WORKFLOW_TAG = /^(?<kind>character|item|monster|location):(?<modality>image|video)$/;

/** Match @mention in group chat messages */
export const MENTION = /@([A-Za-z0-9_-]+)/g;

/** Match @mention at end of message (for autocomplete) */
export const MENTION_AT_END = /@(\w*)$/;

/** Match Object.prototype.toString type extraction */
export const OBJECT_TYPE = /^\[object (\S+)\]$/;

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

export type { CommandIntent, } from "../../regex/image-edit";

export type {
  ControlNetType,
  EditChainEntry,
  EditHistory,
  EditTemplate,
  ParsedCommand,
} from "./types";

export {
  getAvailableIntents,
  getTemplateById,
  getTemplatesForIntent,
  parseEditCommand,
  suggestEdits,
} from "./parser";
export { EDIT_TEMPLATES, } from "./templates";

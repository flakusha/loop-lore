// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skills System — Public API
 *
 * Re-exports skills services for use by routes and other modules.
 */
export { SkillsService, } from "./service";
export type {
  CreateSkillInput,
  Skill,
  SkillTreeNode,
  UpdateSkillInput,
  XpGainResult,
} from "./service";
export { ProficiencyLevel, SkillCategory, } from "./service";

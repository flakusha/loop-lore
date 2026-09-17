// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified prompt template service (FEAT-065) — public API.
 *
 *   CRUD:     src/generation/template-service/crud.ts
 *   Resolve:  src/generation/template-service/resolve.ts
 *   Render:   src/generation/template-service/apply.ts
 */
export { applyImageTemplate, applySimpleTemplate, } from "./apply";
export type { CreateTemplateInput, } from "./crud";
export {
  createTemplate,
  deleteTemplate,
  getOwnedTemplate,
  listTemplates,
  serializeTemplateInput,
  updateTemplate,
} from "./crud";
export { resolveLlmTemplateOverrideId, resolveTemplateDef, } from "./resolve";

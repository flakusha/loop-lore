/**
 * VN Templates — Barrel export
 */

export {
  type VnTemplate,
  type VnTemplateVariable,
  type VnTemplateBody,
  type VnCompositeStep,
  resolveVariables,
  substituteTemplate,
  resolveTemplate,
  getTemplatesForWorld,
  saveTemplate,
  deleteTemplate,
  getTemplate,
  exportTemplate,
  importTemplate,
} from "./template-engine";

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Template Application
 *
 * Applies a scene's template (id + variables) onto the effective render
 * settings. This is the single point where the template engine feeds the
 * live renderer — without it the engine is fully built and never read at
 * render time.
 *
 * Two invariants this module exists to enforce:
 *
 * 1. Never throw. `resolveVariables` throws on a missing REQUIRED variable;
 *    an escaping throw would abort `renderCurrentScene` mid-DOM-build and
 *    leave a half-rendered scene. Fail closed to the base settings.
 * 2. Never emit an out-of-range value. A template `transition` outside
 *    `VnSettings["transition"]` renders a BLANK scene: transition-engine's
 *    switch falls through with no `default`, the fallback timeout computes
 *    NaN, `transitionend` never fires and `onEnd` never restores opacity —
 *    the incoming scene stays at `opacity: 0`. Built-in templates ship
 *    `"fade-in"` (scene-templates) and `"none"` (dialogue-templates), so
 *    this fires in practice, not hypothetically.
 */
import type { VnScene, } from "../scene-renderer/types";
import type { VnSettings, } from "../settings";
import { getDialogueTemplate, getSceneTemplate, } from "./scene-templates";
import { getTemplate, resolveVariables, substituteTemplate, type VnTemplate, } from "./template-engine";

/** The only transition values the renderer accepts (see transition-engine). */
const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  "fade",
  "cut",
  "dissolve",
  "slide",
  "wipe",
],);

const ALLOWED_LAYOUTS: ReadonlySet<string> = new Set(["overlay", "below", "split",],);
const ALLOWED_IMAGE_SCALING: ReadonlySet<string> = new Set(["contain", "cover", "fill", "auto",],);

/**
 * Resolve a scene's `templateId` against the built-in scene registry first,
 * then the world's custom templates in local storage.
 * @param scene Scene carrying the optional templateId.
 * @param worldId World scope for custom-template lookup; null skips it.
 * @returns The template, or undefined when the id is unknown.
 */
export function resolveTemplateForScene(
  scene: VnScene,
  worldId?: string | null,
): VnTemplate | undefined {
  if (!scene.templateId) { return undefined; }
  const builtin = getSceneTemplate(scene.templateId,);
  if (builtin) { return builtin; }
  return worldId ? (getTemplate(worldId, scene.templateId,) ?? undefined) : undefined;
}

/**
 * Resolve any template id: built-in scene registry, built-in dialogue
 * registry, then the world's custom templates. Composite steps may reference
 * scene or dialogue templates, so both registries are consulted.
 * @param templateId Template id from a scene or composite step.
 * @param worldId World scope for custom-template lookup; null skips it.
 * @returns The template, or undefined when the id is unknown.
 */
export function resolveAnyTemplate(
  templateId: string,
  worldId?: string | null,
): VnTemplate | undefined {
  return getSceneTemplate(templateId,) ??
    getDialogueTemplate(templateId,) ??
    (worldId ? (getTemplate(worldId, templateId,) ?? undefined) : undefined);
}

/**
 * Merge an already-resolved template's body onto the base settings.
 *
 * Only `layout`, `imageScaling`, `transition` and `typewriterSpeed` are
 * merged — same whitelist (and for the same blank-scene reasons) as the
 * single-template path. Dialogue templates carry `"none"` transitions and
 * overlay layouts, which the whitelists reject, so only their pacing fields
 * survive; `body.portrait.size` is deliberately NOT mapped (template values
 * are scale-like, settings wants a percentage) and `body.portrait.position`
 * is skipped because the renderer derives position from `scene.role`.
 *
 * @param settings Base render settings.
 * @param template Resolved template (scene or dialogue category).
 * @param variables Substitution variables for `{{var}}` fields.
 * @returns A settings copy with the template's whitelisted overrides.
 */
export function applyResolvedTemplate(
  settings: VnSettings,
  template: VnTemplate,
  variables: Record<string, unknown>,
): VnSettings {
  const merged: VnSettings = { ...settings, };
  const { body, } = template;

  const layout = substituteTemplate(body.layout, variables,);
  if (layout !== "inherit" && ALLOWED_LAYOUTS.has(layout,)) { merged.layout = layout as VnSettings["layout"]; }

  if (body.background?.scaling) {
    const scaling = substituteTemplate(body.background.scaling, variables,);
    if (ALLOWED_IMAGE_SCALING.has(scaling,)) {
      merged.imageScaling = scaling as VnSettings["imageScaling"];
    }
  }

  // Whitelist against the settings union: an unknown value falls back to the
  // base transition instead of rendering a blank scene. See header invariant 2.
  const transition = substituteTemplate(body.transition, variables,);
  if (ALLOWED_TRANSITIONS.has(transition,)) {
    merged.transition = transition as VnSettings["transition"];
  }

  if (typeof body.text?.typewriterSpeed === "number") {
    const speed = Number(substituteTemplate(String(body.text.typewriterSpeed,), variables,),);
    if (Number.isFinite(speed,) && speed > 0) { merged.typewriterSpeed = speed; }
  }

  return merged;
}

/**
 * Apply a scene template's overrides onto the base settings.
 *
 * Resolution order: built-in scene templates, then the world's custom
 * templates (when `worldId` is given). Composite templates return the base
 * settings unchanged here — their step sequence (conditions, delays,
 * per-step application) is executed by the render path via composite.ts,
 * which folds each step through `applyResolvedTemplate`.
 *
 * @param settings Base render settings.
 * @param scene Scene carrying the optional templateId/templateVars.
 * @param worldId World scope for custom-template lookup; optional.
 * @returns Settings to render with — the base object itself when the scene
 *   has no template, the template is unknown or composite, or resolution
 *   threw.
 */
export function applyTemplateOverrides(
  settings: VnSettings,
  scene: VnScene,
  worldId?: string | null,
): VnSettings {
  const template = resolveTemplateForScene(scene, worldId,);
  // Composite templates are orchestrated by the render path; failing closed
  // to base settings here keeps this one-shot path non-composite only.
  if (!template || template.category === "composite") { return settings; }

  let variables: Record<string, unknown>;
  try {
    variables = resolveVariables(template, scene.templateVars ?? {},);
  } catch {
    // Missing required variable — render with base settings rather than
    // aborting the scene build. See header invariant 1.
    return settings;
  }

  return applyResolvedTemplate(settings, template, variables,);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared machinery for the modality template registries (FEAT-065).
 *
 * Video and audio mirror the image `prompt-templates/` shape (profile
 * registry + model-name matching + `{{variable}}` substitution) but their
 * registries are freeform-variable, so the matching and substitution
 * mechanics live here once instead of being cloned per modality.
 */

/** A registry of model profiles with optional model-name matching rules. */
export interface ModalityProfileRegistry<P,> {
  profiles: Record<string, P>;
  defaultProfileId: string;
  /** Model name → profile id rules; first match wins. */
  modelMatching?: readonly { pattern: string; profileId: string }[];
}

/** */
export interface MatchProfileOptions {
  /** Explicit profile id override (wins over modelName matching). */
  profileId?: string;
  /** Model name string (e.g. "wan2.2-t2v", "tts-1-hd"). */
  modelName?: string;
}

/**
 * Resolve a profile by explicit id, model-name pattern match, or default.
 * Unknown explicit ids fall through to the default (same contract as the
 * image `resolveProfile`).
 * @param registry - Profile registry to resolve against
 * @param opts - Explicit id / model name
 * @returns {P}
 */
export function matchModalityProfile<P,>(
  registry: ModalityProfileRegistry<P>,
  opts: MatchProfileOptions = {},
): P {
  let profileId = opts.profileId;
  if (!profileId && opts.modelName && registry.modelMatching) {
    const lower = opts.modelName.toLowerCase();
    for (const rule of registry.modelMatching) {
      if (lower.includes(rule.pattern,)) {
        profileId = rule.profileId;
        break;
      }
    }
  }

  if (!profileId || !registry.profiles[profileId]) {
    profileId = registry.defaultProfileId;
  }

  return registry.profiles[profileId]!;
}

/**
 * Pick the template body for a detail level: the requested level, else the
 * `balanced` body. Every modality applies the same rule, and an explicit
 * override replaces the pick entirely.
 *
 * Deliberately NOT defaulted to "" when neither body is present: a profile
 * missing its template must surface as an undefined body (which the caller's
 * own validation rejects), not as an empty prompt that silently ships.
 * @param templates - the profile's per-detail bodies
 * @param detail - requested detail level
 * @param override - explicit body that wins over the pick
 * @returns {string}
 */
export function pickModalityTemplate<T extends string,>(
  templates: Record<T, string>,
  detail: T,
  override?: string,
): string {
  if (override !== undefined) { return override; }
  return templates[detail] ?? (templates as Record<string, string>).balanced;
}

/**
 * The verbosity word a detail level maps to in a role-switch system prompt.
 * @param detail - requested detail level
 * @returns {string} the adverb to slot into the instruction
 */
export function detailVerbosity(detail: string,): string {
  return detail === "instant" ? "short" : (detail === "balanced" ? "concise" : "detailed");
}

/**
 * Substitute `{{key}}` tokens in a template body from a variable map.
 * Unknown tokens are left verbatim — same contract as `applySimpleTemplate`.
 * @param body - Template body containing `{{variables}}`
 * @param vars - Variable values; a provided empty string renders empty, and
 *   variables absent from the map are left verbatim
 * @returns {string}
 */
export function resolveModalityTemplate(
  body: string,
  vars: Record<string, string>,
): string {
  let result = body;
  for (const [key, value,] of Object.entries(vars,)) {
    result = result.replaceAll(`{{${key}}}`, () => value,);
  }

  return result;
}

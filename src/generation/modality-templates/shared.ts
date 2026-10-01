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
 * Substitute `{{key}}` tokens in a template body from a variable map.
 * Unknown tokens are left verbatim — same contract as `applySimpleTemplate`.
 * @param body - Template body containing `{{variables}}`
 * @param vars - Variable values; empty/missing values render as empty text
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

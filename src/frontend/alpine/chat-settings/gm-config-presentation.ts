// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-settings presentation subset.
 *
 * Online-safe `gmConfig` sub-keys split from `gm-config.ts` to keep it
 * under the file-size guard.
 */

/**
 * `gmConfig` sub-keys that are presentation (display) state, mirroring the
 * backend `GM_CONFIG_PRESENTATION_KEYS` in `src/chat/service/access.ts`. Only
 * these may be mutated once a chat is online; the GM-execution keys stay
 * immutable.
 */
export const GM_CONFIG_PRESENTATION_KEYS = [
  "renderingOverride",
  "visualNovel",
  "vnLayout",
  "vnTypewriter",
  "vnTypewriterSpeed",
  "vnTransition",
  "vnAutoAdvance",
  "vnImageScaling",
  "vnAutoAdvanceDelay",
  "vnDialogueBoxOpacity",
  "vnPortraitSize",
  "vnSplitRatio",
  "responseLengthPreset",
  "responseLengthCustom",
  "outputStyle",
] as const;

/**
 * Subset a full `gmConfig` blob to only the presentation keys, safe to send on
 * an online chat (the backend 409s on any other key). Keeps the backend
 * authoritative while the online path forwards only mutable display state.
 * @param gmConfig
 */
export function presentationGmConfig(
  gmConfig: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of GM_CONFIG_PRESENTATION_KEYS) {
    if (gmConfig[key] !== undefined) { out[key] = gmConfig[key]; }
  }
  return out;
}

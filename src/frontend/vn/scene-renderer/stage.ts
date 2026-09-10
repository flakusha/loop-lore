// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  assignStageSlots,
  buildStageElement,
  createRoster,
} from "../sprite-stage";
import { state, } from "./state";

/**
 * Multi-sprite stage for group scenes (2+ cast members). Single-speaker
 * scenes keep the legacy portrait path so existing layouts stay untouched.
 * @param scene
 * @param scene.role
 * @param scene.speakerId
 * @param scene.emotion
 * @param scene.cast
 * @param settings
 * @param settings.layout
 */
export function createStage(
  scene: {
    role: string;
    speakerId?: string | null;
    emotion?: string;
    cast?: Array<{
      characterId: string;
      name: string;
      avatarAssetId?: string;
      emotionVariants?: Record<string, string>;
      visible?: boolean;
    }>;
  },
  settings: { layout: string },
): HTMLElement | null {
  if (settings.layout === "overlay") { return null; }
  if (!scene.cast || scene.cast.length < 2) { return null; }
  const roster = state.roster?.entries.length ? state.roster : createRoster(scene.cast,);
  const staged = assignStageSlots(roster, scene.role === "narration" ? null : (scene.speakerId ?? null),);
  const stage = document.createElement("div",);
  stage.className = "vn-stage";
  for (const sprite of staged) {
    stage.append(buildStageElement(sprite, scene.emotion,),);
  }
  return stage;
}

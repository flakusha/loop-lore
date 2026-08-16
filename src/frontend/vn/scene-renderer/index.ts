// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Scene Renderer — Barrel export
 */

export {
  addScene,
  destroyVnRenderer,
  getCurrentSceneIndex,
  getSceneCount,
  initVnRenderer,
  jumpToScene,
  nextScene,
  prevScene,
} from "./controller";
export type {
  VnMessage,
  VnScene,
} from "./types";

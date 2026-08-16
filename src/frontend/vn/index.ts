// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Visual Novel Mode — Public API
 *
 * Re-exports all VN mode components for use in chat frontend.
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
  type VnMessage,
  type VnScene,
} from "./scene-renderer";

export {
  getVnSettings,
  resetVnSettings,
  saveVnSettings,
  type VnSettings,
} from "./settings";

export {
  isTypewriting,
  skipTypewrite,
  typewrite,
  type TypewriterOptions,
} from "./typewriter";

export {
  type TransitionOptions,
  transitionScene,
  type TransitionType,
} from "./transition-engine";

export {
  applyPortraitLayout,
  createPortraitElement,
  getPortraitPosition,
  getPortraitUrl,
  type PortraitConfig,
  type PortraitPosition,
} from "./portrait-manager";

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { VnTemplate, } from "../template-engine";
import { SCENE_TEMPLATES, } from "./scene-templates";

export function getSceneTemplate(id: string,): VnTemplate | undefined {
  return SCENE_TEMPLATES.find((t,) => t.id === id);
}

export function listSceneTemplates(): VnTemplate[] {
  return [...SCENE_TEMPLATES,];
}

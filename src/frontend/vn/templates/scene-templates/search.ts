// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { VnTemplate, } from "../template-engine";
import { DIALOGUE_TEMPLATES, } from "./dialogue-templates";
import { SCENE_TEMPLATES, } from "./scene-templates";

export function searchTemplates(query: string,): VnTemplate[] {
  const lower = query.toLowerCase();
  const results: VnTemplate[] = [];
  for (const t of SCENE_TEMPLATES) {
    if (
      t.name.toLowerCase().includes(lower,) || t.description.toLowerCase().includes(lower,) ||
      t.tags.some((tag,) => tag.includes(lower,))
    ) {
      results.push(t,);
    }
  }
  for (const t of DIALOGUE_TEMPLATES) {
    if (
      t.name.toLowerCase().includes(lower,) || t.description.toLowerCase().includes(lower,) ||
      t.tags.some((tag,) => tag.includes(lower,))
    ) {
      results.push(t,);
    }
  }
  return results;
}

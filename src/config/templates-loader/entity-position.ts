// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonStringifyOr, } from "../../utils";
import {
  DEFAULT_ENTITY_TEMPLATE_POSITION,
  type EntityTemplatePosition,
} from "../sections/templates";

const LEGAL_ENTITY_TEMPLATE_POSITIONS: readonly EntityTemplatePosition[] = [
  "before",
  "after",
  "off",
];

/**
 * Validate `entityTemplatePosition` (one of before|after|off). Unknown values
 * — e.g. the typo `"befor"` — would silently behave as the default downstream
 * (anything but "off"/"before" composes the block after the instruction), so
 * warn and fall back to the documented default instead of failing the load.
 * The global logger is not yet initialized during config load
 * (`server/start.ts` creates it after `loadConfig()` returns), so this uses
 * the module's `TemplateConfigWarning` channel like `warnUnknownPromptPurposes`.
 * @param llm - Raw llm config object (mutated in place on invalid values)
 * @returns void
 */
export function validateEntityTemplatePosition(llm: Record<string, unknown>,): void {
  const position = llm.entityTemplatePosition;
  if (position === undefined) { return; }
  if (
    typeof position === "string" &&
    (LEGAL_ENTITY_TEMPLATE_POSITIONS as readonly string[]).includes(position,)
  ) {
    return;
  }

  process.emitWarning(
    `entityTemplatePosition must be one of ${LEGAL_ENTITY_TEMPLATE_POSITIONS.join("|",)}, got ${
      jsonStringifyOr(position, "unknown",)
    } — falling back to "${DEFAULT_ENTITY_TEMPLATE_POSITION}".`,
    "TemplateConfigWarning",
  );

  llm.entityTemplatePosition = DEFAULT_ENTITY_TEMPLATE_POSITION;
}

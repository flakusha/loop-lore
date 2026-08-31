// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { extractProperNouns, } from "./entities";
import { computeHallucinationConfidence, extractContext, } from "./helpers";
import { isKnownEntity, loadKnownEntities, } from "./known";
import type {
  HallucinationAnalysis,
  HallucinationCheckOpts,
  HallucinationFlag,
} from "./types";

/**
 * Analyze generated text for potential hallucinations.
 *
 * Checks:
 * 1. Named entities against known actors, locations, items
 * 2. Specific claims about non-existent entities
 * 3. Invented proper nouns that don't match any DB records
 * @param opts - Check options including DB and text
 * @returns Hallucination analysis with flags
 */
export async function detectHallucinations(
  opts: HallucinationCheckOpts,
): Promise<HallucinationAnalysis> {
  const { db, text, worldId, knownActorIds = [], knownLocationIds = [], } = opts;

  if (text.length < 20) {
    return { detected: false, score: 0, flags: [], summary: "Text too short to analyze", };
  }

  // Extract proper nouns from the text
  const entities = extractProperNouns(text,);

  if (entities.length === 0) {
    return { detected: false, score: 0, flags: [], summary: "No entities detected", };
  }

  // Load known entities from DB
  const knownEntities = await loadKnownEntities(db, worldId,);

  // Transient/dynamic entities that exist this session but not in the static
  // snapshot (B2, 2026-08-25). Treated as known to avoid false positives.
  const allowedNames = new Set(
    (opts.knownEntityNames ?? []).map((n,) => n.toLowerCase()),
  );

  const flags: HallucinationFlag[] = [];

  for (const entity of entities) {
    // Skip if entity is a known participant or a transient/dynamic entity
    if (isKnownEntity(entity.name, knownEntities, knownActorIds, knownLocationIds, allowedNames,)) {
      continue;
    }

    // Entity not found — potential hallucination
    const context = extractContext(text, entity.name,);
    const confidence = computeHallucinationConfidence(entity,);

    if (confidence >= 0.5) {
      flags.push({
        entityName: entity.name,
        entityType: entity.type,
        context,
        confidence,
      },);
    }
  }

  let scoreSum = 0;
  for (const f of flags) { scoreSum += f.confidence; }
  const score = flags.length > 0 ? scoreSum / flags.length : 0;

  const flagNames = Array.from(flags, (f,) => f.entityName,);

  return {
    detected: flags.length > 0,
    score,
    flags,
    summary: flags.length > 0
      ? `Potential hallucinations: ${flagNames.join(", ",)}`
      : "No hallucinations detected",
  };
}

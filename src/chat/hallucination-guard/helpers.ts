import type { ExtractedEntity, } from "./types";

/** Extract the sentence containing the entity for context. */
export function extractContext(text: string, entityName: string,): string {
  const sentences = Array.from(text.split(/[.!?]+/,), (s,) => s.trim(),);
  for (const sentence of sentences) {
    if (sentence.includes(entityName,)) {
      return sentence.slice(0, 200,);
    }
  }
  return text.slice(0, 200,);
}

/** Compute confidence that an entity is a hallucination. */
export function computeHallucinationConfidence(
  entity: ExtractedEntity,
): number {
  // Higher confidence if entity is a proper noun that doesn't match any known entity
  // Lower confidence if entity appears in a very generic context

  let confidence = 0.7; // base confidence for unknown entity

  // Type-specific adjustments
  switch (entity.type) {
    case "character": {
      // Characters are more likely to be hallucinated
      confidence = 0.8;

      break;
    }
    case "location": {
      // Locations are somewhat less likely
      confidence = 0.6;

      break;
    }
    case "item": {
      // Items are less likely to be hallucinated
      confidence = 0.5;

      break;
    }
    case "world": {
      // Shared world facts — lower hallucination likelihood than characters.
      confidence = 0.6;

      break;
    }
  }

  return confidence;
}

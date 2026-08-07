/**
 * Hallucination Guard
 *
 * Validates that entities mentioned in generated text exist in the
 * world state. Flags potential hallucinations where the LLM creates
 * characters, locations, or items that don't exist.
 *
 * Works alongside the existing repetition detector to ensure
 * content quality and world consistency.
 */
export { detectHallucinations, } from "./detect";

export type {
  HallucinationAnalysis,
  HallucinationCheckOpts,
  HallucinationEntityType,
  HallucinationFlag,
} from "./types";

/**
 * AUX Pipeline — Shared auxiliary LLM runner.
 *
 * One policy for every AUX call: fast, cheap, deterministic, time-boxed,
 * BYO-aware, telemetry-tracked. Consumers import `callAux` and a prompt.
 */
export {
  INTENT_CLASSIFIER_PROMPT,
  MEMORY_EXTRACTION_PROMPT,
  TRANSITION_CLASSIFIER_PROMPT,
} from "./prompts";
export { callAux, } from "./runner";
export type { AuxCallOptions, AuxCallResult, AuxTaskName, } from "./types";

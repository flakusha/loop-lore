// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Shared auxiliary LLM runner.
 *
 * One policy for every AUX call: fast, cheap, deterministic, time-boxed,
 * BYO-aware, telemetry-tracked. Consumers import `callAux` and a prompt.
 */
export {
  GM_TOOL_DETECTION_PROMPT,
  INTENT_CLASSIFIER_PROMPT,
  MEMORY_EXTRACTION_PROMPT,
  NSFW_POLICY_LEVELS_PROMPT,
  NSFW_POLICY_PROMPT,
  TRANSITION_CLASSIFIER_PROMPT,
} from "./prompts";
export { callAux, } from "./runner";
export type { AuxCallOptions, AuxCallResult, AuxTaskName, } from "./types";

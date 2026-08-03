/**
 * Prompt text files — pre-defined strings for LLM system messages.
 */

export { ASSISTANT_SYSTEM_PROMPT, } from "./assistant-system";
export {
  GM_SYSTEM_PROMPT,
  LLM_PROMPT_DEFAULTS,
  NSFW_POLICY_PROMPT,
  resolveSystemPrompt,
} from "./registry";
export { VN_CHOICES_PROMPT, VN_STORY_PROMPT, } from "./vn";

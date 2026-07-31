/**
 * Intent Detection & Routing (Epic 42)
 *
 * Decides whether a user request should be routed to:
 * - Generation pipeline (quality + user confirm)
 * - Approved tool execution (pre-approved allowlist)
 * - External API call (per-call policy)
 *
 * Uses keyword-based classification as the default strategy.
 * Designed to be swapped for an LLM-based classifier later.
 */

export type { AssistantIntent, } from "../regex/intent";
import { INTENT_PATTERNS, SLASH_COMMAND, } from "../regex/intent";
import type { AssistantIntent, } from "../regex/intent";

/** Result of intent detection */
export interface IntentResult {
  intent: AssistantIntent;
  confidence: number;
  /** Tool ID, API ID, or generation template name */
  target: string;
  requires_approval: boolean;
}

/** Approved tools that can be executed without user confirmation */
export const APPROVED_TOOLS: Record<string, { description: string; requires_approval: boolean }> = {
  roll: { description: "Roll dice", requires_approval: false, },
  summarize: { description: "Summarize conversation", requires_approval: false, },
  improve: { description: "Improve text", requires_approval: false, },
  impersonate: { description: "Play as a character", requires_approval: false, },
  narrate: { description: "Inject narration", requires_approval: false, },
  help: { description: "Show available commands", requires_approval: false, },
};

/** External APIs that require per-call policy gating */
export const EXTERNAL_APIS: Record<string, { description: string; requires_approval: boolean }> = {
  // Placeholder for future API integrations
};

/**
 * Detect the intent of a user message.
 *
 * @param input - User message text
 * @returns Intent result with confidence and target
 *
 * @example
 * ```typescript
 * const result = detectIntent("Create a character for my RPG");
 * // { intent: "generate", confidence: 0.9, target: "character", requires_approval: true }
 * ```
 */
export function detectIntent(input: string,): IntentResult {
  const trimmed = input.trim().toLowerCase();

  // Check slash commands first — they're always tool_exec
  if (trimmed.startsWith("/",)) {
    const cmdMatch = SLASH_COMMAND.exec(trimmed,);
    if (cmdMatch) {
      const cmd = cmdMatch[1];
      if (cmd && APPROVED_TOOLS[cmd]) {
        return {
          intent: "tool_exec",
          confidence: 0.95,
          target: cmd,
          requires_approval: APPROVED_TOOLS[cmd].requires_approval,
        };
      }
      // Unknown slash command — default to chat
      return {
        intent: "chat",
        confidence: 0.5,
        target: "chat",
        requires_approval: false,
      };
    }
  }

  // Check intent patterns
  for (const pattern of INTENT_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(trimmed,)) {
        return {
          intent: pattern.intent,
          confidence: pattern.confidence,
          target: pattern.target,
          requires_approval: pattern.requires_approval,
        };
      }
    }
  }

  // Default: regular chat message
  return {
    intent: "chat",
    confidence: 0.3,
    target: "chat",
    requires_approval: false,
  };
}

/**
 * Check if a tool is in the approved allowlist.
 *
 * @param toolId - Tool name to check
 * @returns True if the tool is approved for execution
 */
export function isApprovedTool(toolId: string,): boolean {
  return toolId in APPROVED_TOOLS;
}

/**
 * Get the policy for an external API call.
 *
 * @param apiId - API name
 * @returns API policy or undefined if not found
 */
export function getApiPolicy(apiId: string,): { description: string; requires_approval: boolean } | undefined {
  return EXTERNAL_APIS[apiId];
}

// ── Avatar Change Intent Detection ──────────────────────────

import type { AvatarTemplateConfig, } from "../config/sections/templates";

/**
 * Detect avatar change intent using config-defined patterns.
 *
 * @param input - User message text
 * @param avatarConfig - Avatar template config with intent patterns
 * @returns Detected emotion key or null if no match
 *
 * @example
 * ```typescript
 * const emotion = detectAvatarChangeIntent("She smiles warmly", avatarConfig);
 * // "happy"
 * ```
 */
export function detectAvatarChangeIntent(
  input: string,
  avatarConfig: AvatarTemplateConfig,
): string | null {
  const lower = input.toLowerCase();

  for (const pattern of avatarConfig.intentPatterns) {
    if (lower.includes(pattern.pattern.toLowerCase(),)) {
      return pattern.emotion;
    }
  }

  return null;
}

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

/** Intent categories for routing user requests */
export type AssistantIntent = "generate" | "tool_exec" | "api_call" | "chat";

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
 * Keyword patterns for intent classification.
 * Each pattern is matched case-insensitively against the user input.
 */
const INTENT_PATTERNS: {
  intent: AssistantIntent;
  target: string;
  confidence: number;
  requires_approval: boolean;
  patterns: RegExp[];
}[] = [
  // Generation intents — require quality + user confirmation
  {
    intent: "generate",
    target: "character",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*character/i, /generate.*character/i, /new character/i, /make.*character/i,],
  },
  {
    intent: "generate",
    target: "item",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*item/i, /generate.*item/i, /new item/i, /make.*item/i, /craft.*item/i,],
  },
  {
    intent: "generate",
    target: "location",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*location/i, /generate.*location/i, /new location/i, /make.*location/i, /world.*location/i,],
  },
  {
    intent: "generate",
    target: "world",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*world/i, /generate.*world/i, /new world/i, /make.*world/i,],
  },
  {
    intent: "generate",
    target: "image",
    confidence: 0.85,
    requires_approval: true,
    patterns: [/generate.*image/i, /create.*image/i, /draw.*for me/i, /make.*picture/i, /\/image/i,],
  },
  {
    intent: "generate",
    target: "quest",
    confidence: 0.85,
    requires_approval: true,
    patterns: [/create.*quest/i, /generate.*quest/i, /new quest/i, /make.*quest/i, /\/quest/i,],
  },
  // Tool execution intents — pre-approved allowlist
  {
    intent: "tool_exec",
    target: "roll",
    confidence: 0.95,
    requires_approval: false,
    patterns: [/roll.*dice/i, /\/roll/i, /\/dice/i, /\d+d\d+/i,],
  },
  {
    intent: "tool_exec",
    target: "summarize",
    confidence: 0.9,
    requires_approval: false,
    patterns: [/summarize/i, /\/summarize/i, /\/sum\b/i, /summary/i,],
  },
  {
    intent: "tool_exec",
    target: "improve",
    confidence: 0.9,
    requires_approval: false,
    patterns: [/improve/i, /\/improve/i, /rewrite/i, /better.*text/i,],
  },
  // External API call intents — per-call policy
  {
    intent: "api_call",
    target: "search",
    confidence: 0.7,
    requires_approval: true,
    patterns: [/search.*web/i, /look up/i, /find.*info/i, /research/i,],
  },
];

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
    const cmdMatch = /^\/(\w+)/.exec(trimmed,);
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

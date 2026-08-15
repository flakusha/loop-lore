/**
 * Proactive Messaging — Types
 *
 * Per-chat config controlling when the assistant proactively sends messages.
 * See .plan/tickets/TASK-proactive-messaging.md
 */

import type { ProactiveFrequency as PF, } from "./timing";
export type ProactiveFrequency = PF;

/** Per-chat proactive messaging configuration */
export interface ProactiveConfig {
  id: string;
  chatId: string;
  actorId: string;
  frequency: ProactiveFrequency;
  quietHoursStart: string | null; // HH:mm
  quietHoursEnd: string | null; // HH:mm
  enabled: boolean;
  lastProactiveAt: string | null;
  backoffCount: number;
  configJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating/updating proactive config */
export interface ProactiveConfigInput {
  frequency?: ProactiveFrequency;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  enabled?: boolean;
  configJson?: Record<string, unknown>;
}

/** Result of a proactive check */
export interface ProactiveCheckResult {
  shouldMessage: boolean;
  reason: string;
  config: ProactiveConfig | null;
  /** If shouldMessage=true, the next wait time in ms after sending */
  nextCheckMs: number;
}

/** Extra context rules stored in config_json */
export interface ProactiveContextRules {
  /** Only message if user was active within this many ms (0 = no check) */
  requireRecentActivityMs?: number;
  /** Custom prompt prefix for the proactive message */
  promptPrefix?: string;
  /** Max proactive messages per day (0 = unlimited) */
  dailyLimit?: number;
}

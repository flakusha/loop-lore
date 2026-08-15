/**
 * Proactive Messaging Service
 *
 * Determines when the assistant should proactively send a message.
 * Implements frequency-based scheduling, quiet hours, and exponential
 * anti-spam backoff.
 *
 * See .plan/tickets/TASK-proactive-messaging.md
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  countMessagesSince,
  insertConfig,
  selectChatConfigs,
  selectConfig,
  updateConfig,
} from "./db-helpers";
import {
  backoffMs,
  isInQuietHours,
  msUntilMidnight as _msUntilMidnight,
  msUntilQuietHoursEnd as _msUntilQuietHoursEnd,
  PROACTIVE_FREQUENCY_MS,
} from "./timing";
import type {
  ProactiveCheckResult,
  ProactiveConfig,
  ProactiveConfigInput,
  ProactiveContextRules,
} from "./types";

// ── Service ──────────────────────────────────────────────── ────────────────────────────────────────────────

export class ProactiveMessagingService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get proactive config for a chat+actor pair.
   */
  async getConfig(chatId: string, actorId: string,): Promise<ProactiveConfig | null> {
    return selectConfig(this.db, chatId, actorId,);
  }

  /**
   * Get all proactive configs for a chat.
   */
  async getChatConfigs(chatId: string,): Promise<ProactiveConfig[]> {
    return selectChatConfigs(this.db, chatId,);
  }

  /**
   * Create or update proactive config for a chat+actor pair.
   */
  async upsertConfig(
    chatId: string,
    actorId: string,
    input: ProactiveConfigInput,
  ): Promise<ProactiveConfig> {
    const existing = await this.getConfig(chatId, actorId,);

    if (existing) {
      await updateConfig(this.db, chatId, actorId, existing, input,);
    } else {
      await insertConfig(this.db, chatId, actorId, input,);
    }

    const result = await this.getConfig(chatId, actorId,);
    return result!;
  }

  /**
   * Check if a proactive message should be sent right now.
   * Evaluates: enabled flag, quiet hours, frequency timing, anti-spam backoff.
   */
  async checkShouldMessage(chatId: string, actorId: string,): Promise<ProactiveCheckResult> {
    const config = await this.getConfig(chatId, actorId,);
    if (!config) {
      return { shouldMessage: false, reason: "No proactive config", config: null, nextCheckMs: 0, };
    }

    if (!config.enabled) {
      return { shouldMessage: false, reason: "Proactive messaging disabled", config, nextCheckMs: 0, };
    }

    const now = new Date();

    // Quiet hours check
    if (isInQuietHours(config.quietHoursStart, config.quietHoursEnd, now,)) {
      return {
        shouldMessage: false,
        reason: `Quiet hours (${config.quietHoursStart}–${config.quietHoursEnd})`,
        config,
        nextCheckMs: _msUntilQuietHoursEnd(config.quietHoursEnd, now,),
      };
    }

    // Frequency + backoff check
    const baseMs = (PROACTIVE_FREQUENCY_MS as Record<string, number>)[config.frequency] ??
      PROACTIVE_FREQUENCY_MS.normal;
    const requiredMs = backoffMs(baseMs, config.backoffCount,);

    if (config.lastProactiveAt) {
      const elapsed = now.getTime() - new Date(config.lastProactiveAt,).getTime();
      if (elapsed < requiredMs) {
        return {
          shouldMessage: false,
          reason: `Too soon (${Math.round(elapsed / 1000 / 60,)}min / ${
            Math.round(requiredMs / 1000 / 60,)
          }min needed, backoff=${config.backoffCount})`,
          config,
          nextCheckMs: requiredMs - elapsed,
        };
      }
    }

    // Extra context rules check
    const rules = config.configJson as ProactiveContextRules;
    if (rules.dailyLimit && rules.dailyLimit > 0) {
      const todayStart = new Date(now,);
      todayStart.setHours(0, 0, 0, 0,);
      const todayCount = await countMessagesSince(this.db, chatId, actorId, todayStart.toISOString(),);
      if (todayCount >= rules.dailyLimit) {
        return {
          shouldMessage: false,
          reason: `Daily limit reached (${todayCount}/${rules.dailyLimit})`,
          config,
          nextCheckMs: _msUntilMidnight(now,),
        };
      }
    }

    return {
      shouldMessage: true,
      reason: "Ready to send proactive message",
      config,
      nextCheckMs: baseMs,
    };
  }

  /**
   * Record that a proactive message was sent. Resets backoff counter.
   */
  async recordSent(chatId: string, actorId: string,): Promise<void> {
    await this.db
      .updateTable("proactive_messaging_config",)
      .set({
        last_proactive_at: new Date().toISOString(),
        backoff_count: 0,
        updated_at: new Date().toISOString(),
      },)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .execute();
  }

  /**
   * Increment backoff counter (called when user doesn't respond).
   */
  async incrementBackoff(chatId: string, actorId: string,): Promise<void> {
    const config = await this.getConfig(chatId, actorId,);
    if (!config) { return; }

    await this.db
      .updateTable("proactive_messaging_config",)
      .set({
        backoff_count: config.backoffCount + 1,
        updated_at: new Date().toISOString(),
      },)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .execute();
  }

  /**
   * Reset backoff counter (called when user responds).
   */
  async resetBackoff(chatId: string, actorId: string,): Promise<void> {
    await this.db
      .updateTable("proactive_messaging_config",)
      .set({
        backoff_count: 0,
        updated_at: new Date().toISOString(),
      },)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .execute();
  }

  /**
   * Delete proactive config for a chat+actor pair.
   */
  async deleteConfig(chatId: string, actorId: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("proactive_messaging_config",)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }
}

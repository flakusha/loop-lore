// src/assistant/prompt-assembler.ts
//
// Prompt assembly pipeline: fetches actor/chat/message data from DB,
// builds GenerationMessage[] in correct section order, applies token budget.
// See docs/frontend/chat/prompt-creation.md for section ordering rationale.

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { GenerationMessage } from "../generation/gen-types-options";
import { MessageRole, MessageStatus, MessageVisibility, ChatMode } from "../db/enums";
import { defaultTokenCount } from "../generation/context-window-config";

// ── Types ──────────────────────────────────────────────────

export interface PromptParams {
  /** Actor generating the response (character/narrator) */
  actorId: string;
  /** Chat to pull message history from */
  chatId: string;
  /** Model ID for token budget lookup */
  modelId: string;
  /** Override token budget (default: model's contextLimit or 32000) */
  tokenBudget?: number;
  /** Override system prompt (uses actor.system_prompt if absent) */
  systemPromptOverride?: string;
  /** Include story context (auto-detected from chat.mode) */
  includeStoryContext?: boolean;
  /** Include lore entries (default: true) */
  includeLore?: boolean;
  /** Include example messages (default: false) */
  includeExamples?: boolean;
}

export interface PromptSectionReport {
  name: string;
  chars: number;
  tokens: number;
  dropped: boolean;
}

export interface AssembledPrompt {
  /** Messages array for LLM request */
  messages: GenerationMessage[];
  /** Separate system prompt (Anthropic-style providers) */
  systemPrompt?: string;
  /** Total token count estimate */
  tokenCount: number;
  /** Token budget that was enforced */
  tokenBudget: number;
  /** Per-section breakdown for debug UI */
  sections: PromptSectionReport[];
}

// ── Priority rank for section dropping ─────────────────────
// Lower rank = kept longer when trimming
const PRIORITY = {
  system: 0,
  actorHeader: 0,
  chatHistory: 0,
  storyContext: 1,
  lore: 2,
  memories: 3,
  postHistory: 4,
  examples: 5,
} as const;

// ── Assembler ──────────────────────────────────────────────

export class PromptAssembler {
  constructor(private readonly db: Kysely<DB>) {}

  async assemble(params: PromptParams): Promise<AssembledPrompt> {
    const sections: PromptSectionReport[] = [];
    const messages: GenerationMessage[] = [];

    // ── Fetch data ───────────────────────────────────────

    const [actor, chat] = await Promise.all([
      this.db.selectFrom("actors").selectAll().where("id", "=", params.actorId).executeTakeFirstOrThrow(),
      this.db.selectFrom("chats").selectAll().where("id", "=", params.chatId).executeTakeFirstOrThrow(),
    ]);

    const isStory = params.includeStoryContext ?? chat.mode === ChatMode.Story;
    const tokenBudget = params.tokenBudget ?? 32_000;

    // ── Section 1: System prompt ──────────────────────────

    const systemContent = params.systemPromptOverride ?? actor.system_prompt ?? "";
    if (systemContent) {
      const tokens = defaultTokenCount(systemContent);
      sections.push({ name: "system", chars: systemContent.length, tokens, dropped: false });
      messages.push({ role: "system", content: systemContent });
    }

    // ── Section 2: Actor header (character card) ─────────

    const headerParts: string[] = [];
    if (actor.display_name) headerParts.push(`You are ${actor.display_name}.`);
    if (actor.description) headerParts.push(`\nDescription: ${actor.description}`);
    if (actor.personality) headerParts.push(`\nPersonality: ${actor.personality}`);
    if (actor.scenario) headerParts.push(`\nScenario: ${actor.scenario}`);

    if (headerParts.length > 0) {
      const headerText = headerParts.join("");
      const tokens = defaultTokenCount(headerText);
      sections.push({ name: "actorHeader", chars: headerText.length, tokens, dropped: false });
      messages.push({ role: "system", content: headerText });
    }

    // ── Section 3: Lore entries ──────────────────────────

    if (params.includeLore !== false) {
      const loreMessages = await this.buildLoreSection(actor.id, chat.world_id);
      for (const msg of loreMessages) {
        const tokens = defaultTokenCount(msg.content);
        sections.push({ name: "lore", chars: msg.content.length, tokens, dropped: false });
        messages.push(msg);
      }
    }

    // ── Section 4: Memories ──────────────────────────────

    const memoryMessages = await this.buildMemorySection(actor.id);
    for (const msg of memoryMessages) {
      const tokens = defaultTokenCount(msg.content);
      sections.push({ name: "memories", chars: msg.content.length, tokens, dropped: false });
      messages.push(msg);
    }

    // ── Section 5: Post-history instructions ─────────────

    if (actor.post_history_instructions) {
      const tokens = defaultTokenCount(actor.post_history_instructions);
      sections.push({
        name: "postHistory",
        chars: actor.post_history_instructions.length,
        tokens,
        dropped: false,
      });
      messages.push({
        role: "system",
        content: `[Post-history instructions]\n${actor.post_history_instructions}`,
      });
    }

    // ── Section 6: Example messages ──────────────────────

    if (params.includeExamples && actor.mes_example) {
      const parsed = this.parseExampleMessages(actor.mes_example);
      for (const ex of parsed) {
        const tokens = defaultTokenCount(ex.content);
        sections.push({ name: "examples", chars: ex.content.length, tokens, dropped: false });
        messages.push(ex);
      }
    }

    // ── Section 7: Chat history ──────────────────────────

    const historyMessages = await this.fetchChatHistory(params.chatId);
    for (const msg of historyMessages) {
      const tokens = defaultTokenCount(msg.content);
      sections.push({ name: "chatHistory", chars: msg.content.length, tokens, dropped: false });
      messages.push(msg);
    }

    // ── Section 8: Story context ─────────────────────────

    if (isStory) {
      const storyContent = await this.buildStoryContext(chat);
      if (storyContent) {
        const tokens = defaultTokenCount(storyContent);
        sections.push({ name: "storyContext", chars: storyContent.length, tokens, dropped: false });
        messages.push({ role: "system", content: storyContent });
      }
    }

    // ── Token budget enforcement ─────────────────────────

    let totalTokens = sections.reduce((sum, s) => sum + (s.dropped ? 0 : s.tokens), 0);

    if (totalTokens > tokenBudget) {
      // Drop sections in reverse priority order (lowest priority first)
      const ordered = sections
        .map((s, i) => ({ ...s, index: i }))
        .filter((s) => !s.dropped && PRIORITY[s.name as keyof typeof PRIORITY] > 0)
        .sort(
          (a, b) =>
            (PRIORITY[b.name as keyof typeof PRIORITY] ?? 99) -
            (PRIORITY[a.name as keyof typeof PRIORITY] ?? 99),
        );

      for (const section of ordered) {
        if (totalTokens <= tokenBudget) break;
        section.dropped = true;
        sections[section.index].dropped = true;
        totalTokens -= section.tokens;
      }
    }

    // Build final messages array (exclude dropped sections)
    const finalMessages: GenerationMessage[] = [];
    const msgSections = sections.filter((s) => !s.dropped);
    // Map sections back to messages in order
    let msgIdx = 0;
    for (const section of sections) {
      if (!section.dropped && msgIdx < messages.length) {
        finalMessages.push(messages[msgIdx]);
      }
      msgIdx++;
    }

    return {
      messages: finalMessages,
      systemPrompt: systemContent || undefined,
      tokenCount: totalTokens,
      tokenBudget,
      sections,
    };
  }

  // ── Section builders ───────────────────────────────────

  private async buildLoreSection(actorId: string, worldId: string | null): Promise<GenerationMessage[]> {
    const loreMessages: GenerationMessage[] = [];

    const [actorLore, worldLore] = await Promise.all([
      this.db
        .selectFrom("actor_lore_entries")
        .select(["content", "keys", "position", "constant"])
        .where("actor_id", "=", actorId)
        .where("selective", "=", 0) // non-selective = always include
        .orderBy("position", "asc")
        .execute(),
      worldId
        ? this.db
            .selectFrom("world_lore_entries")
            .select(["content", "keys", "position", "constant"])
            .where("world_id", "=", worldId)
            .where("selective", "=", 0)
            .orderBy("position", "asc")
            .execute()
        : Promise.resolve([]),
    ]);

    const allEntries = [...actorLore, ...worldLore];
    if (allEntries.length === 0) return loreMessages;

    const loreText = allEntries.map((e) => e.content).join("\n\n");
    loreMessages.push({ role: "system", content: `[Lore]\n${loreText}` });

    return loreMessages;
  }

  private async buildMemorySection(actorId: string): Promise<GenerationMessage[]> {
    const memories = await this.db
      .selectFrom("actor_memories")
      .select(["content", "memory_type", "importance", "keywords"])
      .where("actor_id", "=", actorId)
      .orderBy("importance", "desc")
      .limit(20)
      .execute();

    if (memories.length === 0) return [];

    const memoryText = memories.map((m) => `- [${m.memory_type}] ${m.content}`).join("\n");

    return [{ role: "system", content: `[Memories]\n${memoryText}` }];
  }

  private async fetchChatHistory(chatId: string): Promise<GenerationMessage[]> {
    const rows = await this.db
      .selectFrom("messages")
      .select(["role", "content", "actor_id"])
      .where("chat_id", "=", chatId)
      .where("status", "=", MessageStatus.Confirmed)
      .where("visibility", "=", MessageVisibility.Visible)
      .where("role", "in", [MessageRole.User, MessageRole.Assistant, MessageRole.Character])
      .orderBy("created_at", "asc")
      .limit(200)
      .execute();

    return rows.map((row) => ({
      role: row.role as "user" | "assistant" | "character",
      content: row.content,
    }));
  }

  private async buildStoryContext(chat: {
    world_id: string | null;
    current_location_id: string | null;
  }): Promise<string | null> {
    if (!chat.world_id) return null;

    const parts: string[] = ["[Story Context]"];

    if (chat.current_location_id) {
      const location = await this.db
        .selectFrom("locations")
        .select(["name", "description"])
        .where("id", "=", chat.current_location_id)
        .executeTakeFirst();
      if (location) {
        parts.push(`\nCurrent location: ${location.name}`);
        if (location.description) parts.push(`\n${location.description}`);
      }

      const locationState = await this.db
        .selectFrom("location_states")
        .select(["atmosphere", "npcs_present", "time_of_day", "weather"])
        .where("location_id", "=", chat.current_location_id)
        .executeTakeFirst();
      if (locationState) {
        if (locationState.time_of_day) parts.push(`\nTime: ${locationState.time_of_day}`);
        if (locationState.weather) parts.push(`\nWeather: ${locationState.weather}`);
        if (locationState.atmosphere) parts.push(`\nAtmosphere: ${locationState.atmosphere}`);
      }
    }

    return parts.length > 1 ? parts.join("") : null;
  }

  // ── Example message parser ─────────────────────────────

  private parseExampleMessages(raw: string): GenerationMessage[] {
    // mes_example format: <START> delimited role:content pairs
    const examples: GenerationMessage[] = [];
    const blocks = raw.split("<START>").filter(Boolean);

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      // Try to parse as name: content or role: content
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) {
        examples.push({ role: "user", content: trimmed });
        continue;
      }

      const label = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const content = trimmed.slice(colonIdx + 1).trim();
      const role =
        label === "assistant" || label === "character" || label === "{{char}}"
          ? "character"
          : label === "user" || label === "{{user}}"
            ? "user"
            : "user";
      examples.push({ role: role, content });
    }

    return examples;
  }
}

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
  /** Current user's actor ID (for persona/impersonation) */
  userId?: string;
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
  userPersona: 0,
  chatHistory: 0,
  storyContext: 1,
  lore: 2,
  memories: 3,
  postHistory: 4,
  examples: 5,
} as const;

// ── Keyword parsing ────────────────────────────────────────

/** Parse the `actor_memories.keywords` JSON column (string[] | null). */
function parseKeywords(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as unknown[]).map(String) : [];
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

// ── Assembler ──────────────────────────────────────────────

export class PromptAssembler {
  constructor(private readonly db: Kysely<DB>) {}

  async assemble(params: PromptParams): Promise<AssembledPrompt> {
    const sections: PromptSectionReport[] = [];
    const messages: GenerationMessage[] = [];

    // ── Fetch data ───────────────────────────────────────

    const [actor, chat] = await Promise.all([
      this.db
        .selectFrom("actors")
        .select([
          "id",
          "display_name",
          "system_prompt",
          "description",
          "personality",
          "scenario",
          "post_history_instructions",
          "mes_example",
        ])
        .where("id", "=", params.actorId)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom("chats")
        .select(["id", "mode", "world_id", "current_location_id"])
        .where("id", "=", params.chatId)
        .executeTakeFirstOrThrow(),
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

    // ── Section 2.5: User Persona / Impersonation ──────────────
    // When impersonation is active, the user's messages are shown as the character.
    // Inject the impersonated character's identity in the user slot.

    if (params.userId) {
      const participant = await this.db
        .selectFrom("chat_participants")
        .select(["impersonate_actor_id", "persona_id"])
        .where("chat_id", "=", params.chatId)
        .where("actor_id", "=", params.userId)
        .executeTakeFirst();

      if (participant?.impersonate_actor_id) {
        // User is impersonating a character - inject that character's identity as the "user"
        const impersonatedActor = await this.db
          .selectFrom("actors")
          .select(["display_name", "description", "personality"])
          .where("id", "=", participant.impersonate_actor_id)
          .executeTakeFirst();

        if (impersonatedActor) {
          const personaParts: string[] = [];
          if (impersonatedActor.display_name) personaParts.push(`Name: ${impersonatedActor.display_name}`);
          if (impersonatedActor.description)
            personaParts.push(`\nDescription: ${impersonatedActor.description}`);
          if (impersonatedActor.personality)
            personaParts.push(`\nPersonality: ${impersonatedActor.personality}`);

          if (personaParts.length > 0) {
            const personaText = `[User Persona]\n${personaParts.join("")}`;
            const tokens = defaultTokenCount(personaText);
            sections.push({ name: "userPersona", chars: personaText.length, tokens, dropped: false });
            messages.push({ role: "system", content: personaText });
          }
        }
      } else if (participant?.persona_id) {
        // User has a persona selected
        const persona = await this.db
          .selectFrom("personas")
          .select(["name", "description"])
          .where("id", "=", participant.persona_id)
          .executeTakeFirst();

        if (persona) {
          const personaParts: string[] = [];
          if (persona.name) personaParts.push(`Name: ${persona.name}`);
          if (persona.description) personaParts.push(`\nDescription: ${persona.description}`);

          if (personaParts.length > 0) {
            const personaText = `[User Persona]\n${personaParts.join("")}`;
            const tokens = defaultTokenCount(personaText);
            sections.push({ name: "userPersona", chars: personaText.length, tokens, dropped: false });
            messages.push({ role: "system", content: personaText });
          }
        }
      }
    }

    // ── Section 3: Lore entries ──────────────────────────

    if (params.includeLore !== false) {
      const loreMessages = await this.buildLoreSection(actor.id, chat.world_id, params.chatId);
      for (const msg of loreMessages) {
        const tokens = defaultTokenCount(msg.content);
        sections.push({ name: "lore", chars: msg.content.length, tokens, dropped: false });
        messages.push(msg);
      }
    }

    // ── Section 4: Memories ──────────────────────────────

    const memoryMessages = await this.buildMemorySection(actor.id, params.chatId);
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

    const historyMessages = await this.fetchChatHistory(params.chatId, tokenBudget);
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

    // Build final messages array (exclude dropped sections).
    // `sections` and `messages` are 1:1 lockstep (one section pushed per message),
    // so dropping a section means dropping the message at the same index. Dropped
    // sections are low-priority (lore/memories/examples) and sit at the front, so a
    // tail splice would wrongly strip chat history instead.
    const finalMessages = messages.filter((_, i) => !sections[i]?.dropped);

    return {
      messages: finalMessages,
      systemPrompt: systemContent || undefined,
      tokenCount: totalTokens,
      tokenBudget,
      sections,
    };
  }

  // ── Section builders ───────────────────────────────────

  private async buildLoreSection(
    actorId: string,
    worldId: string | null,
    chatId: string,
  ): Promise<GenerationMessage[]> {
    const loreMessages: GenerationMessage[] = [];

    // Fetch both selective and non-selective entries
    const [actorLore, worldLore] = await Promise.all([
      this.db
        .selectFrom("actor_lore_entries")
        .select(["content", "keys", "position", "constant", "selective"])
        .where("actor_id", "=", actorId)
        .orderBy("position", "asc")
        .execute(),
      worldId
        ? this.db
            .selectFrom("world_lore_entries")
            .select(["content", "keys", "position", "constant", "selective"])
            .where("world_id", "=", worldId)
            .orderBy("position", "asc")
            .execute()
        : Promise.resolve([]),
    ]);

    // Constant entries are always included. Non-selective entries are always
    // included. Selective entries are only injected when at least one of their
    // keys appears in the most recent user message — otherwise they bloat the
    // prompt with lore that is irrelevant to the current turn.
    const contextWords = await this.recentUserWords(chatId);
    const isRelevant = (entry: {
      content: string;
      keys: unknown;
      constant: number | boolean;
      selective: number | boolean;
    }): boolean => {
      if (entry.constant) return true;
      if (!entry.selective) return true;
      const keys = parseKeywords(entry.keys);
      if (keys.length === 0) return true;
      return keys.some((k) => contextWords.has(k.toLowerCase()));
    };

    const relevantEntries = [...actorLore, ...worldLore].filter((entry) => isRelevant(entry));
    const loreText = relevantEntries.map((e) => e.content).join("\n\n");
    if (loreText) {
      loreMessages.push({ role: "system", content: `[Lore]\n${loreText}` });
    }

    return loreMessages;
  }

  private async buildMemorySection(actorId: string, chatId: string): Promise<GenerationMessage[]> {
    const memories = await this.db
      .selectFrom("actor_memories")
      .select(["content", "memory_type", "importance", "keywords"])
      .where("actor_id", "=", actorId)
      .orderBy("importance", "desc")
      .limit(20)
      .execute();

    if (memories.length === 0) return [];

    // Keyword filtering: memories tagged with keywords are only injected
    // when at least one keyword appears in the latest user message. This
    // keeps the most relevant memories without bloating the prompt with
    // top-20-by-importance regardless of context.
    const contextWords = await this.recentUserWords(chatId);
    const relevant = memories.filter((m) => {
      const keys = parseKeywords(m.keywords);
      if (keys.length === 0) return true;
      return keys.some((k) => contextWords.has(k.toLowerCase()));
    });

    if (relevant.length === 0) return [];

    const memoryText = relevant.map((m) => `- [${m.memory_type}] ${m.content}`).join("\n");

    // XML delimiting prevents injected memories from being mistaken for
    // instructions by the model.
    return [{ role: "system", content: `<memory_context>\n${memoryText}\n</memory_context>` }];
  }

  /** Lowercased word set of the most recent user message in a chat. */
  private async recentUserWords(chatId: string): Promise<Set<string>> {
    const row = await this.db
      .selectFrom("messages")
      .select(["content"])
      .where("chat_id", "=", chatId)
      .where("role", "=", MessageRole.User)
      .where("status", "=", MessageStatus.Confirmed)
      .where("visibility", "=", MessageVisibility.Visible)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    if (!row?.content) return new Set();
    return new Set(
      row.content
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter(Boolean),
    );
  }

  private async fetchChatHistory(chatId: string, tokenBudget: number): Promise<GenerationMessage[]> {
    // Fetch messages dynamically based on token budget (approx 4 chars per token)
    const maxMessages = Math.floor(tokenBudget / 4);
    const rows = await this.db
      .selectFrom("messages")
      .select(["role", "content", "actor_id"])
      .where("chat_id", "=", chatId)
      .where("status", "=", MessageStatus.Confirmed)
      .where("visibility", "=", MessageVisibility.Visible)
      .where("role", "in", [
        MessageRole.User,
        MessageRole.Assistant,
        MessageRole.Character,
        MessageRole.System,
      ])
      .orderBy("created_at", "asc")
      .limit(maxMessages)
      .execute();

    return rows.map((row) => ({
      role: row.role,
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
      const role = ["assistant", "character", "{{char}}"].includes(label)
        ? "character"
        : label === "user" || label === "{{user}}"
          ? "user"
          : "user";
      examples.push({ role: role, content });
    }

    return examples;
  }
}

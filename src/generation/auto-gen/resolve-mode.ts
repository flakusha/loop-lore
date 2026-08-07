/**
 * Mode dispatch for auto-generation.
 *
 * Handles story mode (full GM orchestration, returns `handled`) and resolves
 * the GM-role system-prompt override for non-story chats.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils";
import type { GenDeps, } from "./deps";
import { triggerStoryModeGeneration, } from "./story-mode";

export interface ResolveModeOpts {
  d: GenDeps;
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  parentMessageId: string | null;
  userId: string;
  /** Chat row subset (type + mode + gm_config + world_id). */
  chat: { type?: string; mode?: string; gm_config?: string | null; world_id?: string | null } | undefined;
}

export type ResolveModeResult =
  | { handled: true }
  | { handled: false; systemPromptOverride: string | undefined };

/**
 * Run story-mode generation (when applicable) and resolve the GM-role system
 * prompt override.
 *
 * @returns `handled: true` when story mode ran (caller must stop); otherwise
 *   the system-prompt override for the `"gm"` assistant role.
 */
export async function resolveMode(opts: ResolveModeOpts,): Promise<ResolveModeResult> {
  const { d, database, config, chatId, parentMessageId, userId, chat, } = opts;

  // ── Story mode: use GameMasterService for full GM orchestration ──
  if (chat?.mode === "story") {
    await triggerStoryModeGeneration({
      database,
      config,
      chatId,
      parentMessageId,
      userId,
      gmConfig: chat?.gm_config ?? null,
      worldId: chat?.world_id ?? null,
      deps: d,
    },);
    return { handled: true, };
  }

  // ── GM role runtime effect ─────────────────────────────────────
  // The chat's `assistantRole` (from `chats.gm_config`, set via the role
  // dropdown in chat settings) is stored but until now had no backend
  // effect outside story mode. For `"gm"` role we branch the assembled
  // prompt's system message onto the config-driven GM prompt so the
  // character responds in a GM/narrator voice. Other roles fall through
  // to the normal assistant/character prompt.
  const assistantRole = chat?.gm_config
    ? jsonParseOr<{ assistantRole?: "off" | "helper" | "gm" | "moderator" }>(chat.gm_config, {},).assistantRole
    : undefined;
  const systemPromptOverride = assistantRole === "gm"
    ? resolveSystemPrompt(config.templates.llm, "gm",)
    : undefined;

  return { handled: false, systemPromptOverride, };
}

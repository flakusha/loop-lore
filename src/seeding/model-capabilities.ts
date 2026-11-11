// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness model-capability seed (TASK-seed-codex-and-claude-model-capability-rows-for-harness-enri).
 *
 * Harness model discovery enriches `provider/id` model ids from the admin
 * `model_capabilities` table. The omp flavor's rows arrive via provider
 * health scans (`scanAllProviders` → `upsertModelCapabilities`), but the ACP
 * harness flavors publish no spec-bearing model listing: the codex adapter
 * reports bare preset ids and the claude-code adapter reports bare Anthropic
 * ids (both namespaced by the adapter, never spec'd on the wire). Without a
 * seed, `codex/*` and `claude/*` ids resolve null capabilities while omp
 * models enrich.
 *
 * This module seeds/maintains rows for those two namespaced providers from a
 * static, vendor-documented catalog. It reuses the registry's own authoring
 * surface (`upsertModelCapabilities`), so user-override rows keep their
 * edited fields and only bump `last_seen` — the seed never clobbers admin
 * edits. Idempotent: safe on every boot.
 */

import type { Kysely, } from "kysely";
import { upsertModelCapabilities, } from "../admin/model-capabilities";
import type { DB, } from "../db/schema";
import type { ModelInfo, } from "../generation/providers/types";

/**
 * Codex CLI presets (OpenAI model docs — developers.openai.com/api/docs/
 * models/gpt-5.1-codex{,-mini,-max}, verified 2026-11-11): 400k context,
 * 128k max output, text+image input, function calling, reasoning tokens.
 */
const CODEX_MODELS: ModelInfo[] = [
  {
    id: "gpt-5.1-codex",
    ownedBy: "openai",
    contextWindow: 400_000,
    maxOutput: 128_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
  {
    id: "gpt-5.1-codex-mini",
    ownedBy: "openai",
    contextWindow: 400_000,
    maxOutput: 128_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
  {
    id: "gpt-5.1-codex-max",
    ownedBy: "openai",
    contextWindow: 400_000,
    maxOutput: 128_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
];

/**
 * Claude API alias ids as claude-agent-acp reports them (Anthropic model
 * docs — platform.claude.com per-model overview pages, verified 2026-11-11):
 * the 5.5 lineup and Opus 4.6 carry 1M context / 128k max output, Sonnet 4.5
 * and Haiku 4.5 carry 200k / 64k; all accept text+image input, tool use,
 * and (adaptive or extended) thinking.
 */
const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: "claude-opus-5-5",
    ownedBy: "anthropic",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
  {
    id: "claude-sonnet-5-5",
    ownedBy: "anthropic",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
  {
    id: "claude-haiku-5-5",
    ownedBy: "anthropic",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
  {
    id: "claude-opus-4-6",
    ownedBy: "anthropic",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
  {
    id: "claude-sonnet-4-5",
    ownedBy: "anthropic",
    contextWindow: 200_000,
    maxOutput: 64_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
  {
    id: "claude-haiku-4-5",
    ownedBy: "anthropic",
    contextWindow: 200_000,
    maxOutput: 64_000,
    toolCalling: true,
    thinking: true,
    modalities: ["text", "image",],
  },
];

/** Provider id → bare model-id catalog for the namespaced ACP providers. */
const HARNESS_CAPABILITY_SEEDS: Record<string, ModelInfo[]> = {
  codex: CODEX_MODELS,
  claude: CLAUDE_MODELS,
};

/**
 * Seed/maintain capability rows for the namespaced harness providers
 * (`codex/*`, `claude/*`). Goes through `upsertModelCapabilities`, so an
 * admin-authored override keeps its fields; auto rows refresh in place.
 * Called on every boot and after a factory reset.
 * @param database - Kysely instance.
 * @throws {Error} when the underlying upsert fails (boot aborts seeding, not
 * the server — callers decide whether that is fatal).
 * @returns {Promise<number>} number of catalog rows ensured.
 */
export async function seedHarnessModelCapabilities(
  database: Kysely<DB>,
): Promise<number> {
  let ensured = 0;
  for (const [providerId, models,] of Object.entries(HARNESS_CAPABILITY_SEEDS,)) {
    await upsertModelCapabilities(database, providerId, models,);
    ensured += models.length;
  }

  return ensured;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat setup template CRUD + built-in starter templates.
 *
 * Templates are presets bound at chat creation: a chat records its
 * `template_id` and key mechanics become immutable once the chat is online
 * (see `crud/update.ts`). This module owns the defaults (code), the
 * idempotent seeding (code defaults + config-file templates merged by slug),
 * and admin CRUD.
 */
import type { Kysely, } from "kysely";
import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils";
import { findMainRepoRoot, } from "../../utils/git-worktree";
import { CHAT_SETUP_TEMPLATE_DEFAULTS, type ChatSetupTemplateDefault, } from "./template-defaults";
import { parseFeatures, } from "./template-queries";
import type { ChatSetupTemplate, } from "./types";

/**
 * Load config-file chat setup templates from `configs/templates/chat-setup.yaml`
 * (or `.yml` / `.toml`). YAML takes priority. Returns an empty array when no
 * file exists or it declares no templates.
 *
 * Shape:
 * ```yaml
 * templates:
 *   - slug: my-rpg
 *     name: My RPG
 *     description: ...
 *     mode: story
 *     turnStrategy: round_robin
 *     visualNovel: false
 *     worldId: null
 *     gmConfig: null
 *     features: [rpg mode, no assistant]
 * ```
 * @param cwd Base directory for resolving the templates config.
 * @returns Chat setup template defaults loaded from config files.
 */
export function loadConfigChatSetupTemplates(cwd?: string,): ChatSetupTemplateDefault[] {
  const base = cwd ?? process.cwd();
  const candidates = findTemplateCandidates(base,);
  if (candidates.length === 0) { return []; }

  // YAML wins over TOML when both exist (templates-loader convention).
  const chosen = candidates.find((c,) => c.kind === "yaml") ?? candidates[0]!;
  const raw = readFileSync(chosen.path, "utf8",);
  let parsed: unknown;
  try {
    parsed = chosen.kind === "toml" ? Bun.TOML.parse(raw,) : Bun.YAML.parse(raw,);
  } catch {
    return [];
  }

  const list = (parsed as { templates?: unknown }).templates;
  if (!Array.isArray(list,)) { return []; }

  const templates: ChatSetupTemplateDefault[] = [];
  for (const item of list) {
    const t = toTemplateDefault(item,);
    if (t) { templates.push(t,); }
  }
  return templates;
}

/**
 * Collect chat-setup template files under the repo config dirs.
 * @param base Base directory to start scanning from.
 * @returns Candidate file paths with their format.
 */
function findTemplateCandidates(
  base: string,
): { path: string; kind: "yaml" | "toml" }[] {
  const roots: string[] = [];
  for (const root of [base, findMainRepoRoot(base,),]) {
    if (root) { roots.push(root,); }
  }

  const candidates: { path: string; kind: "yaml" | "toml" }[] = [];
  for (const root of roots) {
    const dir = path.join(root, "configs", "templates",);
    if (!existsSync(dir,) || !statIsDir(dir,)) { continue; }
    for (const file of ["chat-setup.yaml", "chat-setup.yml", "chat-setup.toml",]) {
      const full = path.join(dir, file,);
      if (existsSync(full,)) {
        candidates.push({ path: full, kind: file.endsWith(".toml",) ? "toml" : "yaml", },);
      }
    }
  }
  return candidates;
}

/**
 * Convert one raw config-file template entry into the default shape.
 * @param item
 * @returns void
 */
function toTemplateDefault(item: unknown,): ChatSetupTemplateDefault | null {
  const t = item as Record<string, unknown>;
  const slug = typeof t.slug === "string" && t.slug ? t.slug : null;
  const name = typeof t.name === "string" && t.name ? t.name : null;
  if (!slug || !name) { return null; }
  const visualNovel = t.visualNovel === true;
  return {
    id: `template-${slug}`,
    slug,
    name,
    description: typeof t.description === "string" ? t.description : "",
    mode: typeof t.mode === "string" ? t.mode : "direct",
    turn_strategy: typeof t.turnStrategy === "string" ? t.turnStrategy : "round_robin",
    gmConfig: visualNovel ? jsonStringifyOr({ renderingOverride: "visual_novel" as const, }, "{}",) : null,
    features: Array.isArray(t.features,)
      ? Array.from(t.features, String,)
      : [],
    visibility: typeof t.visibility === "string" ? t.visibility : undefined,
  };
}

/**
 * @param p Path to check.
 * @returns True if the path is a directory.
 */
function statIsDir(p: string,): boolean {
  try {
    return statSync(p,).isDirectory();
  } catch {
    return false;
  }
}

/**
 * List all chat setup templates, with parsed features.
 * @param database Active Kysely database.
 * @returns All chat setup templates ordered by name.
 */
export async function listChatSetupTemplates(
  database: Kysely<DB>,
): Promise<ChatSetupTemplate[]> {
  const rows = await database
    .selectFrom("chat_setup_templates",)
    .selectAll()
    .orderBy("name", "asc",)
    .execute();
  return Array.from(rows, (row,) => ({
    ...(row as unknown as ChatSetupTemplate),
    features: parseFeatures((row as { features?: string | null }).features ?? null,),
  }),);
}

/**
 * Seed built-in + config-file chat setup templates. Idempotent upsert by slug:
 * missing templates are inserted, existing rows are never touched (admin edits
 * and admin-created templates survive; new code defaults backfill into old DBs).
 * Safe to call at server boot and in tests.
 * @param database
 * @param cwd
 * @returns The number of templates created.
 */
export async function seedChatSetupTemplates(
  database: Kysely<DB>,
  cwd?: string,
): Promise<number> {
  const defaults = [...CHAT_SETUP_TEMPLATE_DEFAULTS, ...loadConfigChatSetupTemplates(cwd,),];

  const existing = await database
    .selectFrom("chat_setup_templates",)
    .select(["id", "slug",],)
    .execute();
  const existingSlugs = new Set(Array.from(existing, (t,) => t.slug,),);

  let created = 0;
  for (const t of defaults) {
    if (existingSlugs.has(t.slug,)) { continue; }
    await database
      .insertInto("chat_setup_templates",)
      .values({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        mode: t.mode,
        turn_strategy: t.turn_strategy,
        gm_config: t.gmConfig,
        features: jsonStringifyOr(t.features, "[]",),
        visibility: t.visibility ?? null,
      },)
      .execute();
    created++;
  }
  return created;
}

/**
 * Create a chat setup template (admin).
 */

// ── Re-exports (admin CRUD lives in sibling modules) ─────
// Explicit named re-exports (instead of the prior wildcard re-export)
// keep this module a leaf for the runtime graph; the wildcard re-export
// pulled in ./template-crud, which itself imports getChatSetupTemplate
// from ./templates — closing the cycle.
export {
  createChatSetupTemplate,
  deleteChatSetupTemplate,
  updateChatSetupTemplate,
} from "./template-crud";
export * from "./template-defaults";
export { getChatSetupTemplate, } from "./template-queries";

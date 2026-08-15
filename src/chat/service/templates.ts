/**
 * Chat setup template CRUD + built-in starter templates.
 *
 * Templates are presets bound at chat creation: a chat records its
 * `template_id` and key mechanics become immutable once the chat is online
 * (see `crud/update.ts`). This module owns the defaults (code), the
 * idempotent seeding (code defaults + config-file templates merged by slug),
 * and admin CRUD.
 */
import { load as parseYaml, } from "js-yaml";
import type { Kysely, } from "kysely";
import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { parse as parseToml, } from "smol-toml";
import { findMainRepoRoot, } from "../../config/templates-loader/discovery";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { CHAT_SETUP_TEMPLATE_DEFAULTS, type ChatSetupTemplateDefault, } from "./template-defaults";
import type { ChatSetupTemplate, } from "./types";

/** Default chat setup template shape (code-defined). */
/**
 * Parse the features JSON column into a string array.
 */
function parseFeatures(raw: string | null,): string[] | null {
  if (!raw) { return null; }
  const parsed = safeJsonParse(raw,);
  if (!parsed.ok || !Array.isArray(parsed.value,)) { return null; }
  return Array.from(parsed.value, String,);
}

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
    parsed = chosen.kind === "toml" ? parseToml(raw,) : parseYaml(raw,);
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

/** Collect chat-setup template files under the repo config dirs. */
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

/** Convert one raw config-file template entry into the default shape. */
function toTemplateDefault(item: unknown,): ChatSetupTemplateDefault | null {
  const t = item as Record<string, unknown>;
  const slug = typeof t.slug === "string" && t.slug ? t.slug : null;
  const name = typeof t.name === "string" && t.name ? t.name : null;
  if (!slug || !name) { return null; }
  return {
    id: `template-${slug}`,
    slug,
    name,
    description: typeof t.description === "string" ? t.description : "",
    mode: typeof t.mode === "string" ? t.mode : "direct",
    turn_strategy: typeof t.turnStrategy === "string" ? t.turnStrategy : "round_robin",
    visual_novel: t.visualNovel === true ? 1 : 0,
    features: Array.isArray(t.features,)
      ? Array.from(t.features, String,)
      : [],
    visibility: typeof t.visibility === "string" ? t.visibility : undefined,
  };
}

function statIsDir(p: string,): boolean {
  try {
    return statSync(p,).isDirectory();
  } catch {
    return false;
  }
}

/**
 * List all chat setup templates, with parsed features.
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
 * Resolve a chat setup template by id or slug.
 */
export async function getChatSetupTemplate(
  database: Kysely<DB>,
  templateId: string,
): Promise<ChatSetupTemplate | null> {
  const row = await database
    .selectFrom("chat_setup_templates",)
    .selectAll()
    .where((eb,) => eb.or([eb("id", "=", templateId,), eb("slug", "=", templateId,),],))
    .executeTakeFirst();
  if (!row) { return null; }
  return {
    ...(row as unknown as ChatSetupTemplate),
    features: parseFeatures((row as { features?: string | null }).features ?? null,),
  };
}

/**
 * Seed built-in + config-file chat setup templates. Idempotent upsert by slug:
 * missing templates are inserted, existing rows are never touched (admin edits
 * and admin-created templates survive; new code defaults backfill into old DBs).
 * Safe to call at server boot and in tests.
 *
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
        visual_novel: t.visual_novel,
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

// ── Re-exports (defaults + admin CRUD live in sibling modules) ─────
export * from "./template-crud";
export * from "./template-defaults";

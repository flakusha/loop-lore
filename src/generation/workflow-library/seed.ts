// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Seeds the workflow library from `configs/workflows/*.json` on boot.
 *
 * INSERT-IF-ABSENT, never update. The DB is the source of truth once a row
 * exists; `configs/` only contributes workflows that are not in the library
 * yet. That gives the operator both behaviours they need from one rule:
 *
 *   - dropping a new workflow into configs/ and restarting imports it;
 *   - editing a workflow in the admin UI is NOT clobbered on next restart.
 *
 * A re-syncing seed would silently revert every web edit on every restart,
 * and a delete-propagating seed would make a git branch switch destructive.
 * Neither is acceptable, so neither is implemented.
 *
 * Filenames stay ids, so `configs/workflows/txt2img.json` imports as
 * `txt2img` and the existing loader's names remain valid.
 */
import type { Kysely, } from "kysely";
import { readdir, readFile, } from "node:fs/promises";
import { extname, join, } from "node:path";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import type { WorkflowPayload, } from "../template-types";
import { isValidWorkflow, } from "../workflow-loader/workflow-validation";
import { validateWorkflowPayload, } from "./validate";

const DEFAULT_DIR = "configs/workflows";

/** What the seed did, for logging and for the boot caller. */
export interface SeedOutcome {
  imported: string[];
  skipped: { id: string; reason: string }[];
}

/**
 * Owner for seeded rows.
 *
 * `prompt_templates.owner_id` is NOT NULL and cascades on user delete, so a
 * seeded workflow must belong to a real user row. The oldest admin is used
 * when one exists; otherwise seeding is skipped rather than inventing a user.
 */
let ownerId: string | null = null;

/** Test seam: forget the cached owner id. */
export function resetSeedOwnerForTests(): void {
  ownerId = null;
}

async function resolveOwner(database: Kysely<DB>,): Promise<string | null> {
  if (ownerId !== null) { return ownerId === "" ? null : ownerId; }
  const admin = await database
    .selectFrom("users",)
    .select("id",)
    .where("role", "=", "admin",)
    .orderBy("created_at", "asc",)
    .executeTakeFirst();
  ownerId = admin?.id ?? "";
  return ownerId === "" ? null : ownerId;
}

/**
 * Read one workflow file into a storable payload, or explain why not.
 *
 * Seeded files are bare API-format graphs; the category/parameters/
 * requiredNodes metadata is library metadata the operator edits in the UI.
 * @param path - File to read
 */
async function readPayload(
  path: string,
): Promise<{ ok: true; payload: WorkflowPayload } | { ok: false; reason: string }> {
  const text = await readFile(path, "utf8",);
  const graph = jsonParseOr<unknown>(text, undefined,);
  if (graph === undefined) { return { ok: false, reason: "not valid JSON", }; }
  if (!isValidWorkflow(graph,)) { return { ok: false, reason: "not a ComfyUI graph", }; }
  return {
    ok: true,
    payload: {
      body: graph as WorkflowPayload["body"],
      // Seeded files predate the category field; txt2img is the overwhelmingly
      // common case and the admin can correct it in the UI.
      category: "txt2img",
      parameters: [],
      requiredNodes: [],
    },
  };
}

/**
 * Import any workflow file that is not already in the library.
 *
 * Never throws for a single bad file: a malformed workflow is logged and
 * skipped so one bad JSON cannot stop the server from booting.
 * @param database - Kysely handle
 * @param dir - Directory to scan; defaults to configs/workflows
 */
export async function seedWorkflowLibrary(
  database: Kysely<DB>,
  dir: string = DEFAULT_DIR,
): Promise<SeedOutcome> {
  const log = getLogger().child({ module: "workflow-library-seed", },);
  const outcome: SeedOutcome = { imported: [], skipped: [], };

  let entries: string[];
  try {
    entries = await readdir(dir,);
  } catch (error) {
    log.info("no workflow directory to seed", { dir, reason: String(error,), },);
    return outcome;
  }

  const owner = await resolveOwner(database,);
  if (owner === null) {
    log.info("no admin user to own seeded workflows; skipping seed",);
    return outcome;
  }

  for (const entry of entries.toSorted()) {
    if (extname(entry,) !== ".json") { continue; }
    const id = entry.replace(/\.json$/, "",);

    const existing = await database
      .selectFrom("prompt_templates",)
      .select("id",)
      .where("id", "=", id,)
      .executeTakeFirst();
    if (existing) {
      // Already in the library — the DB wins, always. Not an error.
      outcome.skipped.push({ id, reason: "already in library", },);
      continue;
    }

    const read = await readPayload(join(dir, entry,),);
    if (!read.ok) {
      log.warn("skipping workflow file", { id, reason: read.reason, },);
      outcome.skipped.push({ id, reason: read.reason, },);
      continue;
    }

    const validated = validateWorkflowPayload(read.payload,);
    if (!validated.ok) {
      log.warn("skipping invalid workflow", { id, errors: validated.errors, },);
      outcome.skipped.push({ id, reason: validated.errors.join("; ",), },);
      continue;
    }

    await database
      .insertInto("prompt_templates",)
      .values({
        id,
        owner_id: owner,
        modality: "workflow",
        name: id,
        description: null,
        model_family: null,
        payload: jsonStringifyOr(validated.payload,),
      },)
      .execute();
    outcome.imported.push(id,);
    log.info("imported workflow into library", { id, },);
  }

  return outcome;
}

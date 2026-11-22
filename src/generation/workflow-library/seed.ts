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
 * ONE exception: a row that declares NO parameters while its body still
 * carries `{{placeholders}}` can never be built — `buildWorkflowGraph`
 * rejects it. The seed derives the parameters the body needs and writes them
 * back, which repairs the rows seeded before the parameters were derived.
 * An edited row is untouched: once it declares its own parameters, it is no
 * longer the broken shape.
 *
 * Filenames stay ids, so `configs/workflows/txt2img.json` imports as
 * `txt2img` and the existing loader's names remain valid.
 */
import type { Kysely, } from "kysely";
import { readdir, readFile, } from "node:fs/promises";
import { basename, extname, join, } from "node:path";
import type { DB, } from "../../db/schema";
import type { ImageEditCategory, } from "../../image-edit/types";
import { getLogger, } from "../../logger";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import type { WorkflowPayload, } from "../template-types";
import { findDeadNodes, isValidWorkflow, } from "../workflow-loader/workflow-validation";
import { BINDINGS_FILE, loadWorkflowBindings, parametersForSpec, } from "./binding-config";
import type { WorkflowBindingConfig, WorkflowBindingSpec, } from "./bindings";
// hint: Logic changed on both sides. Requires understanding intent of each change.
import { baseWorkflowId, deriveParameters, repairParameters, } from "./seed-parameters";
import { CATEGORIES, validateWorkflowPayload, } from "./validate";

const DEFAULT_DIR = "configs/workflows";

/**
 * Sinks that make a graph a video workflow. The image-edit library has no
 * video pipeline, so seeding one under a default `txt2img` category hands the
 * image provider a graph it cannot submit. A node-class rule stays
 * deterministic and leaves the shipped SaveImage/SaveImageAdvanced graphs
 * alone.
 */
const VIDEO_SINK_CLASSES: ReadonlySet<string> = new Set([
  "DaSiWaH3ClipAssemble",
  "DaSiWa_EnhancedVideoCombine",
  "SaveVideo",
  "VHS_VideoCombine",
],);

/**
 * Category for a seeded file, from its name.
 *
 * A bare API-format graph has no category field. The shipped files are named
 * after the category they implement (`img2img.json` is an img2img workflow), so
 * that name is the category. Anything else falls back to txt2img, which the
 * operator can correct in the admin UI.
 *
 * Getting this wrong is not cosmetic: `SDServerEditProvider.execute` switches
 * on `template.category` to pick a dispatch, so a mislabelled workflow runs
 * the wrong pipeline.
 * @param id - Workflow id (the file's basename)
 */
function categoryFor(id: string,): ImageEditCategory {
  const base = baseWorkflowId(id,);
  return CATEGORIES.includes(base as ImageEditCategory,) ? base as ImageEditCategory : "txt2img";
}

/** What the seed did, for logging and for the boot caller. */
export interface SeedOutcome {
  imported: string[];
  /** Rows whose missing parameters were derived and written back. */
  repaired: string[];
  skipped: { id: string; reason: string }[];
}

/**
 * Owner for seeded rows.
 *
 * `prompt_templates.owner_id` is NOT NULL and cascades on user delete, so a
 * seeded workflow must belong to a real user row.
 *
 * Both `solo` and `admin` qualify. A default install runs in solo mode, where
 * the operator's account has `role = 'solo'` and there is *no* admin user until
 * the avatar seeder runs several steps later — matching on `admin` alone made
 * the seed silently skip on every fresh install, which a booted server proved
 * (`no admin user to own seeded workflows; skipping seed`) even though the unit
 * tests, which create an admin, passed. Oldest first so the choice is stable
 * across restarts.
 */
let ownerId: string | null = null;

/**
 * Test seam: forget the cached owner id.
 * @returns {void}
 */
export function resetSeedOwnerForTests(): void {
  ownerId = null;
}

async function resolveOwner(database: Kysely<DB>,): Promise<string | null> {
  if (ownerId !== null) { return ownerId; }
  const owner = await database
    .selectFrom("users",)
    .select("id",)
    .where("role", "in", ["solo", "admin",],)
    .orderBy("created_at", "asc",)
    .executeTakeFirst();

  // A miss is not cached: on a fresh install the seed runs before the first
  // user exists, and caching the miss made every later seed call skip too,
  // so the workflows never landed even once the operator's account did.
  if (!owner) { return null; }
  ownerId = owner.id;
  return ownerId;
}

/**
 * Read one workflow file into a storable payload, or explain why not.
 *
 * Seeded files are bare API-format graphs; the category and requiredNodes
 * metadata is library metadata the operator edits in the UI, while the
 * parameters are derived from the graph's own placeholders.
 * @param path - File to read
 * @param id - Workflow id (the file's basename)
 */
async function readPayload(
  path: string,
  id: string,
  spec?: WorkflowBindingSpec,
  policy: WorkflowBindingConfig["bindingPolicy"] = "augment",
): Promise<{ ok: true; payload: WorkflowPayload } | { ok: false; reason: string }> {
  const text = await readFile(path, "utf8",);
  const graph = jsonParseOr<unknown>(text, undefined,);
  if (graph === undefined) { return { ok: false, reason: "not valid JSON", }; }
  if (!isValidWorkflow(graph,)) {
    return { ok: false, reason: "not a loadable ComfyUI graph (needs a real output sink)", };
  }

  const classes = Object.values(graph as WorkflowPayload["body"],).map((node,) => node.class_type);
  if (classes.some((classType,) => VIDEO_SINK_CLASSES.has(classType,))) {
    return { ok: false, reason: "video workflow is not an image-edit template", };
  }

  return {
    ok: true,
    payload: {
      body: graph as WorkflowPayload["body"],
      // A bare graph carries no category. When the file is named after a
      // category (img2img.json, inpaint.json) that name is the category;
      // otherwise fall back to txt2img, which the admin can correct in the UI.
      // Guessing txt2img unconditionally mislabelled img2img, and
      // `sd-server-provider` dispatches on this value.
      category: categoryFor(basename(path, ".json",),),
      parameters: parametersForSpec(spec, deriveParameters(id, graph as WorkflowPayload["body"],), policy,),
      ...(spec === undefined ? {} : { bindings: spec, }),
      // Declared from the graph itself (same derivation as the admin UI
      // ingest): every seeded export carries the exact node classes its
      // runtime needs, so the live `missingRequiredNodes` check on the admin
      // surface can flag a workflow whose node pack is absent. An empty
      // declaration would make that check vacuous.
      requiredNodes: [...new Set(classes,),].toSorted(),
    },
  };
}

/**
 * Converted-mode ids for a stored probe-passing row, else none.
 * @param payloadText - Stored row payload JSON
 * @param probeStatus - Stored probe gate state
 * @returns The row's own dead ids when converted, otherwise empty
 */
function convertedExemption(payloadText: string, probeStatus: string,): string[] {
  if (probeStatus !== "passing") { return []; }
  const stored = jsonParseOr<unknown>(payloadText, null,);
  if (typeof stored !== "object" || stored === null || Array.isArray(stored,)) { return []; }
  const body = (stored as { body?: unknown }).body;
  if (typeof body !== "object" || body === null || Array.isArray(body,)) { return []; }
  return findDeadNodes(body as WorkflowPayload["body"],);
}

/**
 * Import any workflow file that is not already in the library.
 *
 * Never throws for a single bad file: a malformed workflow is logged and
 * skipped so one bad JSON cannot stop the server from booting.
 * @param database - Kysely handle
 * @param dir - Directory to scan; defaults to configs/workflows
 * @returns {Promise<SeedOutcome>}
 */
export async function seedWorkflowLibrary(
  database: Kysely<DB>,
  dir: string = DEFAULT_DIR,
): Promise<SeedOutcome> {
  const log = getLogger().child({ module: "workflow-library-seed", },);
  const outcome: SeedOutcome = { imported: [], repaired: [], skipped: [], };

  let entries: string[];
  try {
    entries = await readdir(dir,);
  } catch (error) {
    log.info("no workflow directory to seed", { dir, reason: String(error,), },);
    return outcome;
  }

  const loaded = await loadWorkflowBindings(dir,);
  if (!loaded.ok) { log.warn("ignoring invalid bindings config", { dir, errors: loaded.errors, },); }
  const config = loaded.ok ? loaded.config : null;

  const owner = await resolveOwner(database,);
  if (owner === null) {
    log.info("no admin user to own seeded workflows; skipping seed",);
    return outcome;
  }

  for (const entry of entries.toSorted()) {
    if (extname(entry,) !== ".json" || entry === BINDINGS_FILE) { continue; }
    const id = entry.replace(/\.json$/, "",);

    const existing = await database
      .selectFrom("prompt_templates",)
      .select(["id", "payload", "probe_status",],)
      .where("id", "=", id,)
      .executeTakeFirst();

    if (existing) {
      // Already in the library — the DB wins, always. Not an error, unless
      // the row still has the broken shape the seed used to write: no
      // declared parameters while its body carries placeholders. That row can
      // never be built, so the missing parameters are derived and written
      // back. A row the operator edited declares its own parameters and is
      // left alone. A probe-passing row revalidates in converted mode: its
      // graph came from the converter.
      const converted = convertedExemption(existing.payload, existing.probe_status,);
      if (await repairParameters(database, existing, id, { unreferencedLive: converted, },)) {
        outcome.repaired.push(id,);
        log.info("repaired workflow parameters", { id, },);
        continue;
      }

      outcome.skipped.push({ id, reason: "already in library", },);
      continue;
    }

    const read = await readPayload(
      join(dir, entry,),
      id,
      config?.workflows[id],
      config?.bindingPolicy ?? "augment",
    );

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

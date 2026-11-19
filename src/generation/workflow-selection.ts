// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-user workflow selection for generation use cases.
 *
 * Defaults and the supported set per use case live in
 * `configs/workflow-defaults.json`; user overrides live in
 * `users.settings.workflowSelections`. Overrides are validated against the
 * configured set — an unknown id never reaches a generation call.
 */
import type { Kysely, } from "kysely";
import fs from "node:fs";
import { join, } from "node:path";
import type { DB, } from "../db/schema";
import { jsonParseOr, } from "../utils";
import { getWorkflowLoader, } from "./workflow-loader";

/** Generation use cases that carry a selectable workflow. */
export type WorkflowUseCase =
  | "image.generate"
  | "image.edit"
  | "video.generate"
  | "audio.generate";

/** Configured default and allowed workflow ids for one use case. */
export interface WorkflowSelectionDefaults {
  supported: readonly string[];
  default: string;
}

/** Options for {@link resolveWorkflowForUseCase}. */
export interface ResolveWorkflowOptions {
  database: Kysely<DB>;
  userId: string;
  useCase: WorkflowUseCase;
  fallback?: string;
}

/** Options for {@link getWorkflowCatalog}. */
export interface CatalogOptions {
  database: Kysely<DB>;
  userId: string;
}

/** One use case's catalog row for the frontend selector. */
export interface WorkflowCatalogEntry {
  useCase: WorkflowUseCase;
  selected: string;
  supported: Array<{ id: string; label: string }>;
}

const USE_CASES: readonly WorkflowUseCase[] = [
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.generate",
];

/** Human-readable label for an id ("minimax-h3-image" -> "Minimax H3 Image"). */
function labelFor(id: string,): string {
  return id
    .split(/[-_]/,)
    .filter((part,) => part.length > 0)
    .map((part,) => part[0]!.toUpperCase() + part.slice(1,))
    .join(" ",);
}

/**
 * Read the configured defaults from `configs/workflow-defaults.json`.
 * Missing or malformed entries degrade to an empty supported set rather
 * than throwing and taking down the catalog route.
 * @returns Defaults keyed by use case.
 */
export function getWorkflowDefaults(): Record<WorkflowUseCase, WorkflowSelectionDefaults> {
  const file = join(import.meta.dir, "../../configs", "workflow-defaults.json",);
  const raw = jsonParseOr<Partial<Record<WorkflowUseCase, Partial<WorkflowSelectionDefaults>>>>(
    fs.readFileSync(file, "utf8",),
    {},
  );

  const defaults = {} as Record<WorkflowUseCase, WorkflowSelectionDefaults>;

  for (const useCase of USE_CASES) {
    const entry = raw[useCase];
    defaults[useCase] = {
      supported: Array.isArray(entry?.supported,)
        ? entry.supported.filter((id,): id is string => typeof id === "string" && id.length > 0)
        : [],
      default: typeof entry?.default === "string" ? entry.default : "",
    };
  }

  return defaults;
}

/**
 * Read one user's persisted selections, dropping unknown use cases and
 * non-string values.
 * @param database - Kysely DB handle.
 * @param userId - Owner of the settings row.
 * @returns Validated use-case-to-workflow map (possibly empty).
 */
export async function getUserWorkflowSelections(
  database: Kysely<DB>,
  userId: string,
): Promise<Partial<Record<WorkflowUseCase, string>>> {
  const user = await database
    .selectFrom("users",)
    .select("settings",)
    .where("id", "=", userId,)
    .executeTakeFirst();

  if (!user) { return {}; }

  const settings = jsonParseOr<Record<string, unknown>>(user.settings ?? "", {},);
  const raw = settings.workflowSelections;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw,)) { return {}; }

  const stored = raw as Record<string, unknown>;
  const selections: Partial<Record<WorkflowUseCase, string>> = {};
  for (const useCase of USE_CASES) {
    const id = stored[useCase];
    if (typeof id === "string" && id.length > 0) { selections[useCase] = id; }
  }

  return selections;
}

/**
 * Resolve the workflow for a use case: validated user override, then the
 * configured default, then the caller's fallback.
 * @param options
 * @returns Workflow id, or undefined when nothing is configured.
 */
export async function resolveWorkflowForUseCase({
  database,
  userId,
  useCase,
  fallback,
}: ResolveWorkflowOptions,): Promise<string | undefined> {
  const configured = getWorkflowDefaults()[useCase];
  if (!configured) { return fallback; }

  const stored = (await getUserWorkflowSelections(database, userId,))[useCase];
  if (stored && configured.supported.includes(stored,)) { return stored; }
  return configured.default || fallback;
}

/**
 * Build the per-user catalog shown in the frontend selector. Configured ids
 * are intersected with the workflows actually loaded from disk so the UI
 * never offers a workflow that cannot run; the configured default is always
 * present.
 * @param options
 * @returns One entry per use case.
 */
export async function getWorkflowCatalog({
  database,
  userId,
}: CatalogOptions,): Promise<WorkflowCatalogEntry[]> {
  const defaults = getWorkflowDefaults();
  const selections = await getUserWorkflowSelections(database, userId,);
  const available = new Set(await getWorkflowLoader().listWorkflows(),);

  return USE_CASES.map((useCase,) => {
    const configured = defaults[useCase];
    const supported = configured.supported.filter((id,) => available.has(id,));
    if (configured.default && !supported.includes(configured.default,)) {
      supported.unshift(configured.default,);
    }

    const stored = selections[useCase];
    const selected = stored && configured.supported.includes(stored,)
      ? stored
      : configured.default;

    return {
      useCase,
      selected,
      supported: supported.map((id,) => ({ id, label: labelFor(id,), })),
    };
  },);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builder chain persistence — chains are `prompt_templates` rows with
 * modality `workflow` and payload variant `kind: "chain"`, so ownership,
 * validation, and serialization all reuse the template service.
 *
 * Every read/write is owner-scoped: `getOwnedTemplate`/`deleteTemplate`
 * filter on `owner_id`, and `getChain` returns null for rows that are
 * workflow graphs rather than chains (a graph row can never be silently
 * converted into a chain by an update).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  createTemplate,
  deleteTemplate,
  getOwnedTemplate,
  updateTemplate,
} from "../template-service";
import {
  parseTemplatePayload,
  type PromptTemplateRow,
} from "../template-types";
import type { ChainStep, } from "./chain-types";

/** Chain as served to route/UI layers. */
export interface BuilderChain {
  id: string;
  name: string;
  description: string | null;
  steps: ChainStep[];
  createdAt: string;
  updatedAt: string;
}

/** Chain creation input. */
export interface CreateChainInput {
  name: string;
  description?: string | null;
  steps: ChainStep[];
}

/**
 * Project a stored row onto the wire shape.
 * @param row - Stored `prompt_templates` row
 * @returns the chain, or null when the row is a graph (not a chain) payload
 */
function toChain(row: PromptTemplateRow,): BuilderChain | null {
  if (row.modality !== "workflow") { return null; }
  const payload = parseTemplatePayload(row.payload, row.modality,);
  if (!payload || !("kind" in payload)) { return null; }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: payload.steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List a user's chains (workflow-graph rows are skipped).
 * @param db - Kysely database handle
 * @param userId - Owning user
 * @returns chains, newest update first
 */
export async function listChains(
  db: Kysely<DB>,
  userId: string,
): Promise<BuilderChain[]> {
  const rows = await db.selectFrom("prompt_templates",).selectAll()
    .where("owner_id", "=", userId,)
    .where("modality", "=", "workflow",)
    .orderBy("updated_at", "desc",)
    .execute();
  const chains: BuilderChain[] = [];
  for (const row of rows) {
    const chain = toChain(row,);
    if (chain) { chains.push(chain,); }
  }
  return chains;
}

/**
 * Fetch one owned chain.
 * @param db - Kysely database handle
 * @param id - Chain (template row) id
 * @param userId - Requesting user (ownership enforced)
 * @returns the chain, or null when missing/not owned/not a chain
 */
export async function getChain(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<BuilderChain | null> {
  const row = await getOwnedTemplate(db, id, userId,);
  if (!row) { return null; }
  return toChain(row,);
}

/**
 * Create a chain row through the template service (shared ingest gate).
 * @param db - Kysely database handle
 * @param userId - Owning user
 * @param input - Chain creation input
 * @returns the created chain
 * @throws {Error} when the chain payload fails validation
 */
export async function createChain(
  db: Kysely<DB>,
  userId: string,
  input: CreateChainInput,
): Promise<BuilderChain> {
  const row = await createTemplate(db, userId, {
    modality: "workflow",
    name: input.name,
    description: input.description,
    payload: { kind: "chain", steps: input.steps, },
  },);
  const chain = toChain(row,);
  if (!chain) { throw new Error("chain failed to round-trip after create",); }
  return chain;
}

/**
 * Update an owned chain. Rows that are not chains return null unchanged.
 * @param db - Kysely database handle
 * @param id - Chain id
 * @param userId - Requesting user (ownership enforced)
 * @param patch - Fields to change; `steps` re-validates the payload
 * @returns the updated chain, or null when missing/not owned/not a chain
 * @throws {Error} when the patched payload fails validation
 */
export async function updateChain(
  db: Kysely<DB>,
  id: string,
  userId: string,
  patch: Partial<CreateChainInput>,
): Promise<BuilderChain | null> {
  const existing = await getChain(db, id, userId,);
  if (!existing) { return null; }

  const updated = await updateTemplate(db, id, userId, {
    name: patch.name,
    description: patch.description,
    payload: patch.steps !== undefined
      ? { kind: "chain", steps: patch.steps, }
      : undefined,
  },);
  if (!updated) { return null; }
  const chain = toChain(updated,);
  if (!chain) { throw new Error("chain failed to round-trip after update",); }
  return chain;
}

/**
 * Delete an owned chain.
 * @param db - Kysely database handle
 * @param id - Chain id
 * @param userId - Requesting user (ownership enforced)
 * @returns true when a chain row was deleted
 */
export async function deleteChain(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<boolean> {
  const existing = await getChain(db, id, userId,);
  if (!existing) { return false; }
  return deleteTemplate(db, id, userId,);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request schemas for the harness read API.
 *
 * The allowed values come from the shared runtime lists in `src/harness/types`
 * so the boundary can never drift from the vocabulary the exec log records.
 */
import { t, } from "elysia";
import { HARNESS_RESULTS, HARNESS_TASK_TYPES, } from "../../harness/types";

/** Closed union of the task types a run may carry. */
export const taskTypeSchema = t.Union(HARNESS_TASK_TYPES.map((k,) => t.Literal(k,)),);

/** Closed union of the run outcomes. */
export const resultSchema = t.Union(HARNESS_RESULTS.map((k,) => t.Literal(k,)),);

/** The `:runId` path parameter, shared by both run-scoped routes. */
export const runIdParams = t.Object({ runId: t.String({},), },);

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/emotion-avatar-service/job-records.ts — DB-backed job records

import { type Kysely, sql, type UpdateObject, } from "kysely";
import type { EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import type { EmotionGenerationResult, } from "./types";

/** Lifecycle status persisted per generation job. */
export type GenerationJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/** Per-kind request inputs stored as JSON. */
export interface GenerationJobPayload {
  emotions: EmotionType[];
  baseAvatarId: string;
}

/** A persisted generation job with parsed JSON columns. */
export interface GenerationJobRecord {
  id: string;
  kind: string;
  actorId: string;
  status: GenerationJobStatus;
  payload: GenerationJobPayload;
  results: EmotionGenerationResult[];
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
/** Inputs for creating a job record at batch start. */
export interface CreateGenerationJobSpec {
  id: string;
  kind: string;
  actorId: string;
  payload: GenerationJobPayload;
  startedAt: string;
}

/** Patch applied at batch boundaries (cancel/complete/fail). */
export interface UpdateGenerationJobPatch {
  status: GenerationJobStatus;
  results?: EmotionGenerationResult[];
  errorMessage?: string | null;
  completedAt?: string;
}

/** Raw generation_jobs row shape for the JSON parser. */
interface GenerationJobRow {
  id: string;
  kind: string;
  actor_id: string | null;
  status: string;
  payload: string;
  results: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Create a job record when a batch starts. Mirrors the in-memory job so
 * gallery/status surfaces survive restarts.
 * @param database
 * @param job
 * @throws Propagates insert failures (a dead database fails the batch loudly).
 */
export async function createGenerationJobRecord(
  database: Kysely<DB>,
  job: CreateGenerationJobSpec,
): Promise<void> {
  await database
    .insertInto("generation_jobs",)
    .values({
      id: job.id,
      kind: job.kind,
      actor_id: job.actorId,
      status: "running",
      payload: jsonStringifyOr(job.payload,),
      results: "[]",
      started_at: job.startedAt,
    },)
    .execute();
}

/**
 * Update a job record at batch boundaries (cancel/complete/fail).
 * @param database
 * @param id
 * @param patch
 */
export async function updateGenerationJobRecord(
  database: Kysely<DB>,
  id: string,
  patch: UpdateGenerationJobPatch,
): Promise<void> {
  const values: UpdateObject<DB, "generation_jobs"> = {
    status: patch.status,
    updated_at: new Date().toISOString(),
  };
  if (patch.results !== undefined) {
    values.results = jsonStringifyOr(patch.results,);
  }
  if (patch.errorMessage !== undefined) {
    values.error_message = patch.errorMessage;
  }
  if (patch.completedAt !== undefined) {
    values.completed_at = patch.completedAt;
  }
  await database
    .updateTable("generation_jobs",)
    .set(values,)
    .where("id", "=", id,)
    .execute();
}

/**
 * Fetch one job record with parsed JSON columns.
 * @param database
 * @param id
 * @returns The record, or undefined when unknown.
 */
export async function getGenerationJobRecord(
  database: Kysely<DB>,
  id: string,
): Promise<GenerationJobRecord | undefined> {
  const row = await database
    .selectFrom("generation_jobs",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirst();
  return row ? toRecord(row,) : undefined;
}

/**
 * List job records for an actor, newest first — the gallery status surface.
 * @param database
 * @param actorId
 * @returns Records newest first.
 */
export async function listGenerationJobRecords(
  database: Kysely<DB>,
  actorId: string,
): Promise<GenerationJobRecord[]> {
  const rows = await database
    .selectFrom("generation_jobs",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .orderBy("created_at", "desc",)
    .orderBy(sql`rowid desc`,)
    .execute();
  return rows.map((row,) => toRecord(row,));
}

/**
 * @param row
 * @returns The row with JSON columns parsed (fallbacks on corrupt JSON).
 */
function toRecord(row: GenerationJobRow,): GenerationJobRecord {
  return {
    id: row.id,
    kind: row.kind,
    actorId: row.actor_id ?? "",
    status: row.status as GenerationJobStatus,
    payload: jsonParseOr<GenerationJobPayload>(row.payload, { emotions: [], baseAvatarId: "", },),
    results: jsonParseOr<EmotionGenerationResult[]>(row.results, [],),
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

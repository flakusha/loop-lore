// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/resource/external-inference.ts — provisioned external inference endpoints
// (LLM, SD/ComfyUI). Secrets pass through credential-store: only the one-way
// ref is persisted, never plaintext. Paused/revoked/exhausted resources never
// call out — the guard rejects with a structured error carrying a fallback note.

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db/schema";
import { parseQuota, QuotaEngine, QuotaExceededError, type ResourceQuota, } from "../generation/quota-engine";
import { jsonStringifyOr, } from "../utils";
import { storeCredential, } from "./credential-store";

/** Supported external inference endpoint kinds. */
export type InferenceKind = "llm" | "sd" | "comfyui";

/** Public view of a provisioned inference resource (no secret material). */
export interface InferenceResource {
  id: string;
  ownerId: string;
  kind: InferenceKind;
  provider: string;
  endpoint: string;
  credentialRef: string;
  quota: ResourceQuota;
  status: string;
}

/** Options for provisioning an inference endpoint. */
export interface AddInferenceOpts {
  /** Stable id; generated when omitted. */
  id?: string;
  ownerId: string;
  kind: InferenceKind;
  provider: string;
  endpoint: string;
  /** Raw secret — hashed/wrapped, never persisted. */
  secret: string;
  wrapSecret?: string;
  quota?: ResourceQuota;
}

/** Availability failure modes carrying a built-in fallback note. */
export type ResourceUnavailableReason = "unknown" | "paused" | "revoked" | "exhausted";

/** Structured rejection when a resource cannot serve (caller falls back). */
export class ResourceUnavailableError extends Error {
  readonly resourceId: string;
  readonly reason: ResourceUnavailableReason;
  /** Human note naming the built-in fallback path. */
  readonly fallback: string;

  // eslint-disable-next-line local/options-object-params -- positional (resourceId, reason, fallback) is the pre-existing call shape at 5 sites.
  constructor(resourceId: string, reason: ResourceUnavailableError["reason"], fallback: string,) {
    super(`Resource "${resourceId}" is ${reason}; ${fallback}`,);
    this.name = "ResourceUnavailableError";
    this.resourceId = resourceId;
    this.reason = reason;
    this.fallback = fallback;
  }
}

/** Dry-run probe result: no outbound call is ever made. */
export type InferenceTestResult =
  | { ok: true; resource: InferenceResource }
  | { ok: false; reason: ResourceUnavailableError["reason"]; fallback: string };

const KIND_PREFIX = "inference:";
const KINDS: InferenceKind[] = ["llm", "sd", "comfyui",];

interface InferenceRow {
  id: string;
  owner_id: string;
  type: string;
  provider: string;
  endpoint: string;
  credential_ref: string;
  quota: string;
  status: string;
}

const COLUMNS = ["id", "owner_id", "type", "provider", "endpoint", "credential_ref", "quota", "status",] as const;

function toPublic(row: InferenceRow, quota: ResourceQuota,): InferenceResource {
  const kind = row.type.slice(KIND_PREFIX.length,) as InferenceKind;
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind,
    provider: row.provider,
    endpoint: row.endpoint,
    credentialRef: row.credential_ref,
    quota,
    status: row.status,
  };
}

/**
 * Provision an inference endpoint. The secret is hashed/wrapped via
 * credential-store; only the ref lands in `resource_records`.
 */
export async function addInferenceResource(db: Kysely<DB>, opts: AddInferenceOpts,): Promise<InferenceResource> {
  if (!KINDS.includes(opts.kind,)) { throw new Error(`Unknown inference kind "${opts.kind}"`,); }
  if (!opts.ownerId || !opts.provider || !opts.endpoint) {
    throw new Error("ownerId, provider, and endpoint are required",);
  }

  const credentialRef = await storeCredential(opts.secret, opts.wrapSecret,);
  const quota = opts.quota ?? { requestsPerMinute: 60, };
  const id = opts.id ?? randomUUID();
  await db
    .insertInto("resource_records",)
    .values({
      id,
      owner_id: opts.ownerId,
      type: `${KIND_PREFIX}${opts.kind}`,
      provider: opts.provider,
      endpoint: opts.endpoint,
      credential_ref: credentialRef,
      quota: jsonStringifyOr(quota,),
      status: "active",
    },)
    .execute();

  return {
    id,
    ownerId: opts.ownerId,
    kind: opts.kind,
    provider: opts.provider,
    endpoint: opts.endpoint,
    credentialRef,
    quota,
    status: "active",
  };
}

/** List provisioned inference endpoints, optionally scoped to an owner. */
export async function listInferenceResources(db: Kysely<DB>, ownerId?: string,): Promise<InferenceResource[]> {
  let query = db.selectFrom("resource_records",).select(COLUMNS,).where("type", "like", `${KIND_PREFIX}%`,);
  if (ownerId !== undefined) { query = query.where("owner_id", "=", ownerId,); }
  const rows = await query.execute() as InferenceRow[];
  return rows.map((row,) => toPublic(row, parseQuota(row.quota, row.id,),));
}

/** Revoke an endpoint: status tombstone, so the guard blocks resolution. */
export async function revokeInferenceResource(db: Kysely<DB>, resourceId: string,): Promise<void> {
  const updated = await db
    .updateTable("resource_records",)
    .set({ status: "revoked", },)
    .where("id", "=", resourceId,)
    .where("type", "like", `${KIND_PREFIX}%`,)
    .executeTakeFirst();

  if (updated.numUpdatedRows === 0n) { throw new Error(`Unknown resource "${resourceId}"`,); }
}

/**
 * Pre-call guard: active-status check, then quota ceiling. Rejects with
 * ResourceUnavailableError BEFORE any provider call; never calls out.
 */
export async function checkInferenceAvailable(
  db: Kysely<DB>,
  resourceId: string,
  quota: QuotaEngine = new QuotaEngine(),
): Promise<InferenceResource> {
  const row = await db
    .selectFrom("resource_records",)
    .select(COLUMNS,)
    .where("id", "=", resourceId,)
    .executeTakeFirst() as InferenceRow | undefined;

  if (!row || !row.type.startsWith(KIND_PREFIX,)) {
    throw new ResourceUnavailableError(resourceId, "unknown", "using built-in provider fallback.",);
  }

  if (row.status !== "active") {
    const reason = row.status === "paused" ? "paused" : "revoked";
    throw new ResourceUnavailableError(resourceId, reason, "using built-in provider fallback.",);
  }

  const resource = toPublic(row, parseQuota(row.quota, row.id,),);
  try {
    await quota.consumeRequest(resource.id, resource.quota,);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw new ResourceUnavailableError(resourceId, "exhausted", "quota spent; using built-in provider fallback.",);
    }

    throw error;
  }

  return resource;
}

/** Dry-run probe for admin UX: guard outcome as data, never a call-out. */
export async function testInferenceResource(
  db: Kysely<DB>,
  resourceId: string,
  quota?: QuotaEngine,
): Promise<InferenceTestResult> {
  try {
    return { ok: true, resource: await checkInferenceAvailable(db, resourceId, quota,), };
  } catch (error) {
    if (error instanceof ResourceUnavailableError) {
      return { ok: false, reason: error.reason, fallback: error.fallback, };
    }

    throw error;
  }
}

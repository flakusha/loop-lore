// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/storage-quota.ts — soft/hard byte limits at the asset seam.
//
// OFF BY DEFAULT: with no `instance_storage_budgets` row for the scope, both
// asserts return on their first query and nothing else in this file runs, so
// every pre-quota behaviour is byte-for-byte unchanged.
//
//   soft  -> warn once, write continues
//   hard  -> refuse the write (`federation.quota_exceeded`)
//
// The pre-provider assert exists because paying for an image you cannot store
// is the failure worth preventing: `assertGenerationFitsStorage` is called
// BEFORE the provider call, so the refusal costs zero provider invocations.
//
// Eviction is opt-in per budget row (`eviction_policy`). It runs only after a
// hard refusal would otherwise happen; when nothing is evictable the write is
// refused rather than the budget exceeded to make room.

import type { Kysely, } from "kysely";
import { access, } from "node:fs/promises";
import { AssetType, StorageBudgetScope, StorageEvictionPolicy, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { jsonError, } from "../routes/http-utils/errors";
import { ErrorCode, HttpStatus, } from "../routes/http-utils/status";
import { runEvictionSweep, } from "./storage-eviction";
import type { StorageBudget, StorageUsage, } from "./storage-usage";
import { readStorageBudget, readStorageUsage, } from "./storage-usage";

/** Lazy: a bare import must not throw when no root logger exists yet. */
const getLog = () => getChildLogger("federation/storage-quota",);

/** The one error code the epic pins for a hard-limit refusal. */
export const QUOTA_EXCEEDED_ERROR_CODE = ErrorCode.QuotaExceeded;

/** Raised when a write cannot fit the budget, or storage is unreachable. */
export class StorageWriteRefusedError extends Error {
  readonly errorCode: ErrorCode;
  readonly scope: StorageBudgetScope;
  readonly limitBytes: number | null;
  readonly wouldUseBytes: number;

  constructor(
    message: string,
    opts: {
      errorCode: ErrorCode;
      scope: StorageBudgetScope;
      limitBytes: number | null;
      wouldUseBytes: number;
    },
  ) {
    super(message,);
    this.name = "StorageWriteRefusedError";
    this.errorCode = opts.errorCode;
    this.scope = opts.scope;
    this.limitBytes = opts.limitBytes;
    this.wouldUseBytes = opts.wouldUseBytes;
  }
}

/** 507: the budget row exists but the asset root is not reachable. */
export function storageUnavailableResponse(error: StorageWriteRefusedError,): Response {
  return jsonError({
    message: error.message,
    status: HttpStatus.InsufficientStorage,
    code: error.errorCode,
  },);
}

/** 429: the hard limit refuses. The response body a client can act on. */
export function quotaExceededResponse(error: StorageWriteRefusedError,): Response {
  return jsonError({
    message: error.message,
    status: HttpStatus.TooManyRequests,
    code: error.errorCode,
  },);
}

/** Map an asset type onto the budget scope that governs it. */
function scopeForAssetType(assetType: AssetType,): StorageBudgetScope {
  return assetType === AssetType.Memory ? StorageBudgetScope.Total : assetType;
}

/** Both limits for one asset type: the class budget, and the instance total. */
async function budgetsForAssetType(
  database: Kysely<DB>,
  assetType: AssetType,
): Promise<StorageBudget[]> {
  const classScope = scopeForAssetType(assetType,);
  const scopes: StorageBudgetScope[] = classScope === StorageBudgetScope.Total
    ? [StorageBudgetScope.Total,]
    : [classScope, StorageBudgetScope.Total,];

  const rows: StorageBudget[] = [];
  for (const scope of scopes) {
    const budget = await readStorageBudget({ database, scope, },);
    if (budget) { rows.push(budget,); }
  }

  return rows;
}

/** Soft-limit warning. Logged at warn, once per crossing, never blocks. */
function warnSoftLimit(budget: StorageBudget, usage: StorageUsage, incomingBytes: number,): void {
  getLog()?.warn("storage soft limit exceeded; writes still allowed", {
    scope: budget.scope,
    softLimitBytes: budget.softLimitBytes,
    usageBytes: usage.totalBytes,
    incomingBytes,
  },);
}

/**
 * Gate one inbound write. Throws {@link StorageWriteRefusedError} when the hard
 * limit refuses and eviction cannot make room.
 *
 * With no budget row this returns after one query — the federation-off default.
 * @param opts
 * @param opts.database
 * @param opts.uploadDir Asset root; must exist while a budget is configured.
 * @param opts.incomingBytes Size of the payload about to be stored.
 * @param opts.assetType Asset class of that payload.
 * @returns {Promise<void>}
 */
export async function assertStorageWriteAllowed(opts: {
  database: Kysely<DB>;
  uploadDir: string;
  incomingBytes: number;
  assetType: AssetType;
},): Promise<void> {
  const budgets = await budgetsForAssetType(opts.database, opts.assetType,);
  if (budgets.length === 0) { return; }

  if (!(await storageRootReachable(opts.uploadDir,))) {
    throw new StorageWriteRefusedError(
      "storage is unavailable: the asset directory is not reachable",
      {
        errorCode: ErrorCode.StorageUnavailable,
        scope: StorageBudgetScope.Total,
        limitBytes: null,
        wouldUseBytes: opts.incomingBytes,
      },
    );
  }

  for (const budget of budgets) {
    await enforceBudget({ ...opts, budget, },);
  }
}

/**
 * Gate a GENERATION before the provider call. Same limits, no provider spend:
 * when the output cannot fit the remaining hard budget the call is refused up
 * front.
 * @param opts
 * @param opts.database
 * @param opts.uploadDir
 * @param opts.estimatedBytes Expected output size.
 * @param opts.assetType Asset class that will hold the output.
 * @returns {Promise<void>}
 */
export async function assertGenerationFitsStorage(opts: {
  database: Kysely<DB>;
  uploadDir: string;
  estimatedBytes: number;
  assetType: AssetType;
},): Promise<void> {
  return assertStorageWriteAllowed({
    database: opts.database,
    uploadDir: opts.uploadDir,
    incomingBytes: opts.estimatedBytes,
    assetType: opts.assetType,
  },);
}

/** Apply one budget row: warn on soft, refuse on hard (evicting when opted in). */
async function enforceBudget(opts: {
  database: Kysely<DB>;
  uploadDir: string;
  incomingBytes: number;
  budget: StorageBudget;
},): Promise<void> {
  const usage = await readStorageUsage({ database: opts.database, scope: opts.budget.scope, },);
  const wouldUse = usage.totalBytes + opts.incomingBytes;
  const { softLimitBytes: soft, hardLimitBytes: hard, } = opts.budget;

  if (soft !== null && wouldUse > soft) { warnSoftLimit(opts.budget, usage, opts.incomingBytes,); }
  if (hard === null || wouldUse <= hard) { return; }

  if (opts.budget.evictionPolicy === StorageEvictionPolicy.OldestFirst) {
    const sweep = await runEvictionSweep({
      database: opts.database,
      uploadDir: opts.uploadDir,
      scope: opts.budget.scope,
      neededBytes: wouldUse - hard,
    },);

    if (sweep.freedBytes >= wouldUse - hard) { return; }
  }

  throw new StorageWriteRefusedError(
    "storage quota exceeded",
    {
      errorCode: ErrorCode.QuotaExceeded,
      scope: opts.budget.scope,
      limitBytes: hard,
      wouldUseBytes: wouldUse,
    },
  );
}

/** True when the configured asset root is a reachable directory. */
async function storageRootReachable(uploadDir: string,): Promise<boolean> {
  try {
    await access(uploadDir,);
    return true;
  } catch {
    return false;
  }
}

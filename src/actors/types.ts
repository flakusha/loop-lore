// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared contracts for the actor child-resource services
 * (memories / notes / lore entries / items).
 *
 * Every service operation returns a discriminated union: `{ ok: true; … }`
 * on success or an {@link ActorServiceError} (tagged by its `code` field,
 * mirroring the chat service `ServiceError` shape) so callers can translate
 * directly into HTTP semantics (404 / 403 / 400).
 */

/** Structured failure returned by actor child-resource services. */
export interface ActorServiceError {
  ok: false;
  code: "not_found" | "forbidden" | "bad_request";
  message: string;
}

/** Success payload of a paginated list operation. */
export interface ActorChildPage<T,> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Result of a paginated list operation. */
export type ActorListResult<T,> =
  | ({ ok: true } & ActorChildPage<T>)
  | ActorServiceError;

/** Result of a create/update operation returning the affected row. */
export type ActorMutationResult<T,> =
  | { ok: true; entity: T }
  | ActorServiceError;

/** Result of a delete operation. */
export type ActorDeleteResult =
  | { ok: true; id: string }
  | ActorServiceError;

/** Optional paging parameters shared by every list operation. */
export interface ActorListOpts {
  page?: number;
  pageSize?: number;
}

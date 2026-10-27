// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeParseInt, } from "../../utils/parse-number";
import { badRequestResponse, jsonError, } from "./responses";
import { HttpStatus, } from "./status";

// ── Shared route utilities ─────────────────────────────────────

/**
 * Parse request body: JSON or form-encoded.
 * Returns typed body on success, error Response on parse failure.
 * @param request
 * @returns {Promise<Response | T>}
 */
export async function parseBody<T = Record<string, unknown>,>(request: Request,): Promise<T | Response> {
  const ct = request.headers.get("content-type",) ?? "";
  try {
    if (ct.includes("application/json",)) {
      return (await request.json()) as T;
    }

    // form-encoded (htmx default)
    const text = await request.text();
    const params = new URLSearchParams(text,);
    const obj: Record<string, unknown> = Object.fromEntries(params,);
    return obj as T;
  } catch {
    return jsonError({ message: "Invalid request body", status: HttpStatus.BadRequest, },);
  }
}

/**
 * Extract pagination params from URLSearchParams.
 * Defaults: page=1, pageSize=50 (capped at 200).
 * Clamps to safe ranges: page >= 1, pageSize 1..200.
 * @param searchParams
 * @returns {{ page: number; pageSize: number; }}
 */
export function parsePagination(searchParams: URLSearchParams,): { page: number; pageSize: number } {
  const rawPage = Number(searchParams.get("page",) ?? "1",);
  const rawSize = Number(searchParams.get("pageSize",) ?? "50",);
  const page = Number.isFinite(rawPage,) && rawPage >= 1 ? Math.floor(rawPage,) : 1;
  const pageSize = Number.isFinite(rawSize,) ? Math.min(Math.max(1, Math.floor(rawSize,),), 200,) : 50;
  return { page, pageSize, };
}

/** Largest page size a list endpoint serves. */
export const MAX_PAGE_SIZE = 100;

/** Raw pagination values as they arrive on a request's query string. */
export interface PaginationInput {
  /** Raw page number (1-based). */
  page?: string | number | null | undefined;
  /** Raw page size — the `limit` of limit/offset endpoints. */
  size?: string | number | null | undefined;
  /** Raw row offset; wins over the page-derived offset when present. */
  offset?: string | number | null | undefined;
}

/** Options for {@link parsePaginationParams}. */
export interface PaginationOptions {
  /** Page size used when `size` is absent. */
  defaultPageSize?: number;
  /** Page size cap — larger requests are clamped to it. */
  maxPageSize?: number;
  /** Page number used when `page` is absent. */
  defaultPage?: number;
}

/** Validated pagination values ready for a SQL LIMIT/OFFSET. */
export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Read one bounded integer query parameter.
 * Absent (or empty) values fall back to `default`; non-numeric values and
 * values below `min` are rejected with 400; values above `max` are clamped.
 */
function readBoundedInt(
  raw: string | number | null | undefined,
  opts: { default: number; min: number; max: number; name: string },
): number | Response {
  if (raw === undefined || raw === null) { return opts.default; }
  const text = typeof raw === "number" ? String(raw,) : raw.trim();
  if (text === "") { return opts.default; }
  const parsed = safeParseInt(text,);
  if (!parsed.ok || parsed.value < opts.min) { return badRequestResponse(`Invalid ${opts.name}`,); }
  if (parsed.value > opts.max) { return opts.max; }
  return parsed.value;
}

/**
 * Parse and validate the pagination of a list request.
 * The size is bounded — never negative, never NaN — so it cannot reach SQL
 * as `LIMIT -1` (whole table) or as a datatype mismatch; oversized requests
 * are clamped to `maxPageSize` and invalid ones are rejected with 400.
 * @param input - Raw query values (page, size, offset).
 * @param options - Defaults and the page-size cap.
 * @returns Validated pagination values, or a 400 Response for bad input.
 */
export function parsePaginationParams(
  input: PaginationInput,
  options: PaginationOptions = {},
): Pagination | Response {
  const pageSize = readBoundedInt(input.size, {
    default: options.defaultPageSize ?? 50,
    min: 1,
    max: options.maxPageSize ?? MAX_PAGE_SIZE,
    name: "pageSize",
  },);

  if (typeof pageSize !== "number") { return pageSize; }

  const page = readBoundedInt(input.page, {
    default: options.defaultPage ?? 1,
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    name: "page",
  },);

  if (typeof page !== "number") { return page; }

  let offset = (page - 1) * pageSize;
  if (input.offset !== undefined && input.offset !== null) {
    const parsed = readBoundedInt(input.offset, {
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      name: "offset",
    },);

    if (typeof parsed !== "number") { return parsed; }
    offset = parsed;
  }

  return { page, pageSize, offset, };
}

// ── Body field helpers ───────────────────────────────────────

/**
 * Cast body field as string | undefined
 * @param body
 * @param key
 * @returns {string | undefined}
 */
export function str(body: Record<string, unknown>, key: string,): string | undefined {
  return body[key] as string | undefined;
}

/**
 * Cast body field as number | undefined
 * @param body
 * @param key
 * @returns {number | undefined}
 */
export function num(body: Record<string, unknown>, key: string,): number | undefined {
  return body[key] as number | undefined;
}

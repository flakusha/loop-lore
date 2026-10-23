// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend API fetch client: decode the canonical error envelope.
 *
 * Non-2xx responses whose JSON body matches the envelope shape (string
 * `error_code` + `message`) decode to a typed `ApiError` thrown through the
 * existing throw channel. Legacy `{ error, code? }` bodies (the current
 * `jsonError` wire shape) decode too, so both shapes work during migration.
 * The success path is untouched: 2xx responses resolve to the raw `Response`.
 */

/** Typed API error decoded from an error response body. */
export interface ApiError {
  error_code: string;
  message: string;
  details?: unknown;
  request_id?: string;
  retry_after_ms?: number;
  /** HTTP status of the response that carried this error. */
  status: number;
}

/**
 * Decode an unknown JSON body into a typed `ApiError`.
 * New envelope shape first, then the legacy `{ error, code? }` shape.
 * `request_id` stays optional so minimal envelopes decode.
 * @param body parsed JSON body from an error response
 * @param status HTTP status of the response
 * @returns the decoded error, or `undefined` when the body matches neither shape
 */
export function decodeApiError(body: unknown, status: number,): ApiError | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body,)) {
    return undefined;
  }

  const raw = body as Record<string, unknown>;

  // New envelope shape.
  if (typeof raw["error_code"] === "string" && typeof raw["message"] === "string") {
    const out: ApiError = { error_code: raw["error_code"], message: raw["message"], status, };
    if ("details" in raw && raw["details"] !== undefined) {
      out.details = raw["details"];
    }

    const requestId = raw["request_id"] ?? raw["requestId"];
    if (typeof requestId === "string") {
      out.request_id = requestId;
    }

    const retryAfter = raw["retry_after_ms"] ?? raw["retryAfterMs"];
    if (typeof retryAfter === "number") {
      out.retry_after_ms = retryAfter;
    }

    return out;
  }

  // Legacy `jsonError` shape.
  if (typeof raw["error"] === "string") {
    const code = raw["code"];
    const out: ApiError = {
      error_code: typeof code === "string" ? code : `HTTP_${status}`,
      message: raw["error"],
      status,
    };

    if (raw["data"] !== undefined) {
      out.details = raw["data"];
    } else if ("details" in raw && raw["details"] !== undefined) {
      out.details = raw["details"];
    }

    return out;
  }

  return undefined;
}

/** Parse a `Response` body as JSON without throwing; `undefined` on failure. */
async function tryParseJson(res: Response,): Promise<unknown> {
  try {
    return (await res.clone().json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Read an error `Response` body into a typed `ApiError`.
 * @param res failed fetch response carrying a JSON error body
 * @returns the decoded error
 * @throws {Error} with `status` when the body matches neither error shape
 */
export async function readApiError(res: Response,): Promise<ApiError> {
  const decoded = decodeApiError(await tryParseJson(res,), res.status,);
  if (decoded) {
    return decoded;
  }

  const fallback = new Error(`HTTP ${res.status}`,) as Error & { status: number };
  fallback.status = res.status;
  throw fallback;
}

type FetchTransport = (input: string | URL | Request, init?: RequestInit,) => Promise<Response>;

/**
 * Transport seam for tests: module-local fetch handle. Production keeps the
 * native global; tests swap in a stub via `setFetchTransport` (same pattern
 * as peer-work-client's `transport` option).
 */
let transport: FetchTransport = globalThis.fetch;

/**
 * Override the fetch implementation (tests only).
 * @param impl replacement fetch
 * @returns void
 */
export function setFetchTransport(impl: FetchTransport,): void {
  transport = impl;
}

/**
 * Fetch wrapper with typed error decoding.
 *
 * Success path unchanged: 2xx responses resolve to the raw `Response`.
 * Non-2xx responses throw the decoded `ApiError`, or a generic `Error`
 * carrying `status` when the body is not JSON — the same throw channel.
 * Transport goes through the module-local seam (native global by default),
 * never a bare `fetch` call — the repo's no-restricted-syntax rule bans
 * bare `fetch` outside `utils/safe-fetch`.
 * @param url request URL
 * @param init fetch options
 * @returns the raw `Response` for 2xx statuses
 */
export async function fetchClient(url: string, init?: RequestInit,): Promise<Response> {
  const res = await transport(url, init,);
  if (res.ok) {
    return res;
  }

  throw await readApiError(res,);
}

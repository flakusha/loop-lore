// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin provider-wizard API client.
 *
 * Raw `fetch` instead of `apiFetch`: the shared helper discards the body of a
 * non-2xx response (packages/core/src/utils/safe-fetch/fetch.ts), so the
 * backend's own reason — "Provider name already used", "Remote host not
 * approved" — never reached the operator. Everything else `apiFetch` does is
 * kept: the CSRF double-submit header and same-origin credentials, so the gate
 * (src/middleware/csrf-plugin.ts) still accepts the request, the 30s request
 * timeout, and the login redirect on a 401.
 */

import { DEFAULT_TIMEOUT, } from "../../../utils/safe-fetch";
import { getCsrfToken, redirectToLogin, } from "../../fe-fetch";
import { jsonBody, jsonParseOr, } from "../json";
import type { ProviderDescriptor, ProviderSummary, SetupCheck, } from "./presets";

/** Payload accepted by POST /api/v1/admin/setup/providers. */
export interface ProviderPayload {
  name: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  setDefault?: boolean;
}

/** Error body the admin API answers with: `{ error, code, meta }`. */
interface ApiErrorBody {
  error?: string;
}

/**
 * Call the admin API with the CSRF header and the credentials `apiFetch` uses.
 *
 * Keeps apiFetch's client-side guarantees so the swap to a raw fetch only
 * changes WHAT the caller sees (the error body), not how the request behaves:
 * the CSRF double-submit header, same-origin credentials, the 30s timeout
 * `safeFetch` arms, and the login redirect on a 401 — an expired session still
 * lands on the login page instead of an error inside the modal.
 * @param url - API path.
 * @param init - Fetch options (method, headers, body). A caller-supplied
 *   `signal` is not honoured: the wizard issues no cancellable request.
 * @returns The raw response — the caller decides what a non-2xx means.
 * @throws {Error} When the request times out.
 */
async function adminFetch(url: string, init: RequestInit = {},): Promise<Response> {
  const headers = new Headers(init.headers ?? {},);
  const csrf = getCsrfToken();
  if (csrf !== "") { headers.set("X-CSRF-Token", csrf,); }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT,);

  try {
    // eslint-disable-next-line no-restricted-syntax -- raw Response: safeFetch drops the error body for non-2xx.
    const res = await fetch(url, { ...init, headers, credentials: "same-origin", signal: controller.signal, },);
    if (res.status === 401) { redirectToLogin(); }
    return res;
  } catch (err) {
    if (controller.signal.aborted) { throw new Error(`Request timed out after ${DEFAULT_TIMEOUT}ms`,); }
    throw err;
  } finally {
    clearTimeout(timer,);
  }
}

/**
 * Reject a failed response with the server's own message.
 * @param res - The response to check.
 * @throws {Error} With the server's message and the HTTP status attached.
 */
async function assertOk(res: Response,): Promise<void> {
  if (res.ok) { return; }
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }

  const body = jsonParseOr<ApiErrorBody>(text, {},);
  const err = new Error(body.error ?? `HTTP ${res.status}`,) as Error & { status?: number };
  err.status = res.status;
  throw err;
}

/**
 * GET /api/v1/admin/setup/providers - wizard-managed provider instances.
 * @returns The configured instances, or an empty list when the call fails.
 */
export async function listSetupProviders(): Promise<ProviderDescriptor[]> {
  try {
    const res = await adminFetch("/api/v1/admin/setup/providers", { headers: { Accept: "application/json", }, },);
    await assertOk(res,);
    const data = await res.json() as { providers?: ProviderDescriptor[] };
    return data.providers ?? [];
  } catch {
    return [];
  }
}

/**
 * POST /api/v1/admin/setup/providers - create or update a provider instance.
 * @param payload - Provider descriptor, with apiKey only when the operator typed one.
 * @returns The saved descriptor.
 * @throws {Error} With the server's message when the payload is rejected (400).
 */
export async function saveSetupProvider(payload: ProviderPayload,): Promise<ProviderDescriptor> {
  const res = await adminFetch("/api/v1/admin/setup/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: jsonBody(payload,),
  },);

  await assertOk(res,);
  const data = await res.json() as { provider?: ProviderDescriptor };
  if (!data.provider) { throw new Error("provider missing in response",); }
  return data.provider;
}

/**
 * POST /api/v1/admin/providers/rescan - existing route reused for the test step.
 * @returns Health summaries for every known provider.
 * @throws {Error} With the server's message when the rescan is refused.
 */
export async function rescanProviderSummaries(): Promise<ProviderSummary[]> {
  const res = await adminFetch("/api/v1/admin/providers/rescan", { method: "POST", },);
  await assertOk(res,);
  const data = await res.json() as { providers?: ProviderSummary[] };
  return data.providers ?? [];
}

/**
 * PUT /api/v1/admin/model-roles/:role - assign a provider + model to a role.
 * @param role - Model role id.
 * @param provider - Provider instance name.
 * @param model - Model id within that provider.
 * @throws {Error} With the server's message when the role assignment is rejected.
 */
export async function putModelRole(role: string, provider: string, model: string,): Promise<void> {
  const res = await adminFetch(`/api/v1/admin/model-roles/${encodeURIComponent(role,)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", },
    body: jsonBody({ provider, model, },),
  },);

  await assertOk(res,);
  await res.text();
}

/**
 * GET /api/v1/setup/state - optional endpoint, may not exist yet.
 * @returns The checks, or null when the endpoint is absent or unreachable.
 */
export async function fetchSetupChecks(): Promise<SetupCheck[] | null> {
  try {
    const res = await adminFetch("/api/v1/setup/state", { headers: { Accept: "application/json", }, },);
    await assertOk(res,);
    const data = await res.json() as { checks?: SetupCheck[] };
    return data.checks ?? [];
  } catch {
    return null;
  }
}

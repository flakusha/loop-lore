// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Models Overlay — HTTP layer
 *
 * Every call below targets an existing `admin.system`-gated endpoint; the TUI
 * needs no new server surface. Field names are quoted from route source rather
 * than the frontend, because the frontend shapes its own Alpine state:
 *
 *   GET    /api/v1/admin/model-roles          src/routes/admin/model-roles.ts:38-51
 *          -> { roles: ResolvedModelRole[], overrides: Record<...>, validRoles: string[] }
 *          `source` ("db" | "config" | "default") is the whole point of the
 *          surface: it is what tells an operator over ssh why a generation is
 *          not using the model they set. src/admin/model-roles.ts:33-51.
 *   GET    /api/v1/admin/providers            src/routes/admin/providers.ts:51-76
 *          -> { providers: [{name, label, status, modelCount, latencyMs?, error?}] }
 *   GET    /api/v1/admin/providers/:name/models  :77-104
 *          -> { name, label, models, status }; 404 when the provider is unknown
 *   PUT    /api/v1/admin/model-roles/:role    :75-114, body {provider, model}
 *   DELETE /api/v1/admin/model-roles/:role    :116-137, answers 204
 *   POST   /api/v1/admin/providers/rescan     :105-118
 *
 * Role wire values are the lowercase `ModelRole` enum members
 * (src/db/enums-core/flags.ts:77-85), NOT the PascalCase object keys —
 * `Main` is the key, `"main"` is what the route accepts.
 */

import { safeFetch as _realFetch, } from "../utils";
import { API_BASE, } from "./chat";

export { API_BASE, };

/** Result of a models-overlay API call; 403 is mapped to a readable line. */
export type ModelsFetchResult<T,> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/** Where a resolved role's provider/model came from. */
export type RoleSource = "db" | "config" | "default";

/** One resolved role row from GET /api/v1/admin/model-roles. */
export interface ResolvedRole {
  role: string;
  provider: string;
  model: string;
  source: RoleSource;
}

/** DB override record keyed by role (getModelRoleOverrides returns a Record). */
export type RoleOverrides = Record<
  string,
  { provider: string; model: string; temperature: number | null; maxTokens: number | null }
>;

/** Envelope from GET /api/v1/admin/model-roles. */
export interface RolesEnvelope {
  roles: ResolvedRole[];
  overrides: RoleOverrides;
  validRoles: string[];
}

/** One provider row from GET /api/v1/admin/providers. */
export interface ProviderSummary {
  name: string;
  label: string;
  status: string;
  modelCount: number;
  latencyMs?: number;
  error?: string;
}

/** Envelope from GET /api/v1/admin/providers. */
export interface ProvidersEnvelope {
  providers: ProviderSummary[];
}

/**
 * One row from the PUBLIC GET /api/v1/providers.
 *
 * Deliberately narrower than {@link ProviderSummary}: that route needs
 * `admin.system`, this one needs no auth at all and returns no `modelCount`.
 * `status` is the health-cache vocabulary (`healthy` | `unreachable` |
 * `error`), not the raw `healthCheck()` vocabulary.
 */
export interface PublicProvider {
  name: string;
  label: string;
  status: string;
}

/** Envelope from the PUBLIC GET /api/v1/providers. */
export interface PublicProvidersEnvelope {
  providers: PublicProvider[];
}

/**
 * Verdict from POST /api/v1/generation/test-connection.
 *
 * Note the two shapes a caller must distinguish: a *failed health check* still
 * answers HTTP 200 with `ok: false`, so `ok` here says nothing about whether
 * the request reached the provider. `status` carries the raw `healthCheck()`
 * vocabulary (`ok` | `degraded` | `down` | `error`), NOT the health-cache one.
 */
export interface ConnectionTest {
  ok: boolean;
  status: string;
  model?: string;
  latencyMs?: number;
  error?: string;
}

/** One model id from GET /api/v1/admin/providers/:name/models. */
export interface ProviderModel {
  id: string;
}

/** Envelope from GET /api/v1/admin/providers/:name/models. */
export interface ProviderModelsEnvelope {
  name: string;
  label: string;
  models: ProviderModel[];
  status: string;
}

let _fetch = _realFetch;

/**
 * Swap the models-overlay fetcher. Tests use this instead of `mock.module`.
 * @param fn - replacement for the real `safeFetch`
 */
export function setFetch(fn: typeof _realFetch,): void {
  _fetch = fn;
}

/** Shown verbatim when the session lacks `admin.system`. */
export const ADMIN_ONLY = "admin only — this surface needs the admin.system permission";

/**
 * Render a fetch as the result union the overlay renders from.
 * @param result - the raw safeFetch outcome
 * @returns the data, or a message to show in place of it
 */
function buildResult<T,>(
  result: { ok: boolean; data?: T; error?: Error; status?: number },
): ModelsFetchResult<T> {
  if (result.ok) { return { ok: true, data: result.data as T, }; }

  // A non-admin gets 403 from every route in this module. Say so plainly
  // rather than showing "HTTP 403", which reads like a bug.
  if (result.status === 403) { return { ok: false, error: ADMIN_ONLY, status: 403, }; }

  return {
    ok: false,
    error: result.status !== undefined ? `HTTP ${result.status}` : result.error!.message,
    status: result.status,
  };
}

interface CallOptions {
  /** Method; defaults to GET. */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** JSON body for PUT/POST. */
  body?: unknown;
}

/**
 * One authenticated call against the admin surface.
 * @param path - path under `/api/v1`
 * @param sessionToken - bearer token; omit to run anonymous
 * @param options - method and body
 * @returns the parsed body, or a message to render in place of the list
 */
async function call<T,>(
  path: string,
  sessionToken: string | undefined,
  options: CallOptions = {},
): Promise<ModelsFetchResult<T>> {
  try {
    const result = await _fetch<T>(`${API_BASE}/api/v1${path}`, {
      method: options.method ?? "GET",
      auth: sessionToken ? { sessionToken, } : undefined,
      body: options.body,
      handle401: false,
    },);

    return buildResult(result,);
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}

/**
 * Load every manageable role with its resolved provider, model and source.
 * @param sessionToken - bearer token; omit to run anonymous
 * @returns the roles envelope, or a message to render in place of the list
 */
export function loadRoles(sessionToken: string | undefined,): Promise<ModelsFetchResult<RolesEnvelope>> {
  return call<RolesEnvelope>("/admin/model-roles", sessionToken,);
}

/**
 * Load providers with their health snapshot.
 * @param sessionToken - bearer token; omit to run anonymous
 * @returns the providers envelope, or a message to render in place of the list
 */
export function loadProviders(
  sessionToken: string | undefined,
): Promise<ModelsFetchResult<ProvidersEnvelope>> {
  return call<ProvidersEnvelope>("/admin/providers", sessionToken,);
}

/**
 * Load one provider's model ids.
 * @param options - provider name and bearer token
 * @param options.provider - provider name as returned by loadProviders
 * @param options.sessionToken - bearer token; omit to run anonymous
 * @returns the provider's models, or a message to render in place of the list
 */
export function loadProviderModels(options: {
  provider: string;
  sessionToken: string | undefined;
},): Promise<ModelsFetchResult<ProviderModelsEnvelope>> {
  return call<ProviderModelsEnvelope>(
    `/admin/providers/${encodeURIComponent(options.provider,)}/models`,
    options.sessionToken,
  );
}

/**
 * Point a role at a provider/model pair.
 * @param options - role, provider, model and bearer token
 * @param options.role - one of the route's validRoles
 * @param options.provider - provider name
 * @param options.model - model id
 * @param options.sessionToken - bearer token; omit to run anonymous
 * @returns `true` on success, or a message to render in the status line
 */
export function assignRole(options: {
  role: string;
  provider: string;
  model: string;
  sessionToken: string | undefined;
},): Promise<ModelsFetchResult<true>> {
  return call<true>(`/admin/model-roles/${options.role}`, options.sessionToken, {
    method: "PUT",
    body: { provider: options.provider, model: options.model, },
  },);
}

/**
 * Drop a role's DB override so it falls back to config, then server default.
 * @param options - role and bearer token
 * @param options.role - one of the route's validRoles
 * @param options.sessionToken - bearer token; omit to run anonymous
 * @returns `true` on success, or a message to render in the status line
 */
export function clearRole(options: {
  role: string;
  sessionToken: string | undefined;
},): Promise<ModelsFetchResult<true>> {
  return call<true>(`/admin/model-roles/${options.role}`, options.sessionToken, { method: "DELETE", },);
}

/**
 * Re-scan every provider and return the refreshed health summaries.
 * @param sessionToken - bearer token; omit to run anonymous
 * @returns the refreshed summaries, or a message to render in the status line
 */
export function rescanProviders(
  sessionToken: string | undefined,
): Promise<ModelsFetchResult<ProvidersEnvelope>> {
  return call<ProvidersEnvelope>("/admin/providers/rescan", sessionToken, { method: "POST", },);
}

/**
 * Load the PUBLIC provider health list for the status bar.
 *
 * `GET /api/v1/providers` is registered with no auth middleware at all
 * (`src/routes/admin/providers.ts:28-49`), so this needs no token. It is the
 * only provider listing the TUI can read as a non-admin, which is why the
 * status bar uses it rather than the `admin.system` route the overlay uses.
 * @returns the provider statuses, or a message to degrade to on the status bar
 */
export function loadPublicProviders(): Promise<ModelsFetchResult<PublicProvidersEnvelope>> {
  return call<PublicProvidersEnvelope>("/providers", undefined,);
}

/**
 * Ping one provider and report its verdict.
 *
 * `POST /api/v1/generation/test-connection` needs only `requireUserId`, NOT
 * `admin.system` — so unlike every other call here this works for a non-admin
 * who somehow reached the provider list. It resolves the caller's BYO key, so
 * a missing token answers 401 and is reported as an error string rather than
 * throwing.
 * @param options - provider to ping and bearer token
 * @param options.provider - provider name to ping
 * @param options.sessionToken - bearer token; omit to run anonymous
 * @returns the verdict, or a message when the request itself could not complete
 */
export function testProviderConnection(options: {
  provider: string;
  sessionToken: string | undefined;
},): Promise<ModelsFetchResult<ConnectionTest>> {
  return call<ConnectionTest>("/generation/test-connection", options.sessionToken, {
    method: "POST",
    body: { provider: options.provider, },
  },);
}

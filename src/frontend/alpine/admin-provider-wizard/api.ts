// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, } from "../json";
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

/**
 * GET /api/v1/admin/setup/providers - wizard-managed provider instances.
 * @returns The configured instances, or an empty list when the call fails.
 */
export async function listSetupProviders(): Promise<ProviderDescriptor[]> {
  try {
    const res = await apiFetch("/api/v1/admin/setup/providers", { headers: { Accept: "application/json", }, },);
    if (!res.ok) { return []; }
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
 * @throws {Error} With the server message when the payload is rejected (400).
 */
export async function saveSetupProvider(payload: ProviderPayload,): Promise<ProviderDescriptor> {
  const res = await apiFetch("/api/v1/admin/setup/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: jsonBody(payload,),
  },);

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    const err = new Error(body.message || `HTTP ${res.status}`,) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data = await res.json() as { provider?: ProviderDescriptor };
  if (!data.provider) { throw new Error("provider missing in response",); }
  return data.provider;
}

/**
 * POST /api/v1/admin/providers/rescan - existing route reused for the test step.
 * @returns Health summaries for every known provider.
 */
export async function rescanProviderSummaries(): Promise<ProviderSummary[]> {
  const res = await apiFetch("/api/v1/admin/providers/rescan", { method: "POST", },);
  if (!res.ok) { return []; }
  const data = await res.json() as { providers?: ProviderSummary[] };
  return data.providers ?? [];
}

/**
 * PUT /api/v1/admin/model-roles/:role - assign a provider + model to a role.
 * @param role - Model role id.
 * @param provider - Provider instance name.
 * @param model - Model id within that provider.
 */
export async function putModelRole(role: string, provider: string, model: string,): Promise<void> {
  await apiFetch(`/api/v1/admin/model-roles/${encodeURIComponent(role,)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", },
    body: jsonBody({ provider, model, },),
  },);
}

/**
 * GET /api/v1/setup/state - optional endpoint, may not exist yet.
 * @returns The checks, or null when the endpoint is absent or unreachable.
 */
export async function fetchSetupChecks(): Promise<SetupCheck[] | null> {
  try {
    const res = await apiFetch("/api/v1/setup/state", { headers: { Accept: "application/json", }, },);
    if (!res.ok) { return null; }
    const data = await res.json() as { checks?: SetupCheck[] };
    return data.checks ?? [];
  } catch {
    return null;
  }
}

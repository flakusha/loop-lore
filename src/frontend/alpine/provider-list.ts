// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The provider list (`GET /api/v1/providers`) for the frontend surfaces that
 * need it.
 *
 * The endpoint is admin-gated — `BUG-admin-providers-list-vs-auth-conflict-
 * needs-contract-decision` decided that and `BUG-admin-providers-list-endpoint-
 * is-public` landed the anonymous-401 / non-admin-403 contract. A non-admin
 * therefore gets a 403, which is a real state to render, not an error to
 * swallow: both callers used to drop it and left an empty list with no signal
 * (BUG-harness-f1-non-admin-providers-callers-swallow-403).
 *
 * One helper, one classification: every caller gets the same degraded
 * outcome and the same notice key, which the view translates.
 */

/** One provider row as the endpoint serves it. */
export interface ProviderSummary {
  name: string;
  label: string;
  status: string;
}

/** The outcome of one provider-list fetch. */
export interface ProviderListOutcome {
  /** The providers the endpoint listed; empty when the list is unavailable. */
  providers: ProviderSummary[];
  /** True when the endpoint refused the caller (the list is admin-only). */
  forbidden: boolean;
  /** True when the fetch failed for any other reason. */
  failed: boolean;
  /** i18n key of the notice to show; empty when the list loaded. */
  notice: string;
}

/**
 * Fetch the provider list and classify the outcome.
 * @returns the providers plus whether the caller was refused or the fetch failed
 */
export async function fetchProviderList(): Promise<ProviderListOutcome> {
  let res: Response;
  try {
    res = await apiFetch("/api/v1/providers", { headers: { Accept: "application/json", }, },);
  } catch {
    return { providers: [], forbidden: false, failed: true, notice: "common.providerListUnavailable", };
  }

  if (res.status === 403) {
    return { providers: [], forbidden: true, failed: false, notice: "common.providerListAdminOnly", };
  }

  if (!res.ok) {
    return { providers: [], forbidden: false, failed: true, notice: "common.providerListUnavailable", };
  }

  const data = (await res.json()) as { providers?: ProviderSummary[] };
  const providers = Array.isArray(data.providers,) ? data.providers : [];

  return { providers, forbidden: false, failed: false, notice: "", };
}

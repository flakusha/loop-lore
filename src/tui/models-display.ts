// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Models Overlay — row formatters
 *
 * Pure functions, split out of `models-overlay.ts` the same way
 * `harness/display.ts` holds the harness overlay's formatters: no blessed, no
 * fetch, so the interesting part of the surface — how a role's `source` reads
 * — is testable without a screen.
 */

import { escapeMarkup, } from "./markup";
import type { ConnectionTest, ProviderSummary, PublicProvider, ResolvedRole, } from "./models-api";

/** Width the role column occupies before the provider/model pair. */
const ROLE_COL = 11;

/** Width the provider/model pair occupies before the source tag. */
const TARGET_COL = 38;

/**
 * Colour a provider's health status so an outage is visible without reading it.
 * `unknown` falls through to red on purpose: an unchecked provider is exactly
 * the one an operator is looking for.
 * @param provider - one row from GET /api/v1/admin/providers
 * @returns blessed-tagged status text
 */
export function statusMarkup(provider: ProviderSummary,): string {
  if (provider.status === "healthy") { return `{green-fg}${provider.status}{/green-fg}`; }

  return provider.status === "unreachable"
    ? `{yellow-fg}${provider.status}{/yellow-fg}`
    : `{red-fg}${provider.status}{/red-fg}`;
}

/**
 * Render a role row: name, resolved pair, and where that pair came from.
 *
 * `source` is the diagnostic the whole surface exists for — a role tagged
 * `config` or `default` was never overridden in the DB, which is usually the
 * answer to "why isn't this using the model I set".
 * @param role - one resolved role row
 * @returns blessed-tagged list line
 */
export function roleLine(role: ResolvedRole,): string {
  const target = role.provider && role.model ? `${role.provider} / ${role.model}` : "(unset)";
  const source = role.source === "db"
    ? "{green-fg}[db]{/green-fg}"
    : `{gray-fg}[${role.source}]{/gray-fg}`;

  return `{bold}${role.role.padEnd(ROLE_COL,)}{/bold} ${target.padEnd(TARGET_COL,)} ${source}`;
}

/**
 * Render a provider row: label, health, model count, latency and last error.
 * @param provider - one row from GET /api/v1/admin/providers
 * @returns blessed-tagged list line
 */
export function providerLine(provider: ProviderSummary,): string {
  const latency = provider.latencyMs !== undefined ? `  ${provider.latencyMs}ms` : "";
  const error = provider.error ? `  {red-fg}${provider.error}{/red-fg}` : "";

  return `${(provider.label || provider.name).padEnd(16,)} ${
    statusMarkup(provider,).padEnd(22,)
  } ${provider.modelCount} model(s)${latency}${error}`;
}

/** How many unreachable provider names the status bar will name inline. */
const MAX_NAMED = 3;

/** Shown when the health route itself could not be reached. */
export const HEALTH_UNAVAILABLE = "Providers: ?";

/**
 * Render provider reachability as one compact status-bar segment.
 *
 * A count first, then the unreachable names — an operator scanning the bar
 * wants "is anything down", and only needs the names when the answer is yes.
 * When everything is healthy the names are omitted entirely so the segment
 * stays short at the common case.
 * @param providers - rows from the PUBLIC GET /api/v1/providers
 * @returns the segment text, or {@link HEALTH_UNAVAILABLE} when there are none
 */
export function formatProviderHealth(providers: PublicProvider[],): string {
  if (providers.length === 0) { return HEALTH_UNAVAILABLE; }

  const reachable = providers.filter((p,) => p.status === "healthy");
  const total = providers.length;
  const summary = `Providers: {green-fg}${reachable.length}{/green-fg}/${total} ok`;

  if (reachable.length === total) { return summary; }

  const names = providers
    .filter((p,) => p.status !== "healthy")
    .map((p,) => escapeMarkup(p.name,));

  const shown = names.slice(0, MAX_NAMED,).join(", ",);
  const rest = names.length > MAX_NAMED ? ` +${names.length - MAX_NAMED}` : "";

  return `${summary} {yellow-fg}(${shown}${rest}){/yellow-fg}`;
}

/**
 * Render a test-connection verdict for the overlay's status line.
 *
 * `ok` on this route reports whether the HEALTH CHECK passed, not whether the
 * request arrived — a provider that is down answers HTTP 200 with
 * `ok: false`. So the verdict is read from `status`, and the provider's own
 * error message is preferred over the generic word when there is one.
 * @param test - verdict from POST /api/v1/generation/test-connection
 * @returns blessed-tagged one-line summary
 */
export function formatConnectionTest(test: ConnectionTest,): string {
  const latency = test.latencyMs !== undefined ? ` ${test.latencyMs}ms` : "";

  if (test.ok) { return `{green-fg}${test.status}{/green-fg}${latency}`; }

  return `{red-fg}${test.error ?? test.status}{/red-fg}${latency}`;
}

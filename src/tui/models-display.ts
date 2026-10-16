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

import type { ProviderSummary, ResolvedRole, } from "./models-api";

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

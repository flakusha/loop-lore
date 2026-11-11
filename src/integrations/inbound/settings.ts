// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inbound agentic-server settings store (epic-agentic-integration-mcp-acp
 * §3.3 — the inbound MCP/ACP studio transports).
 *
 * Mirrors `src/integrations/harness/admin-settings.ts` (which mirrors
 * `src/nsfw/runtime-config.ts`):
 *
 * - the FILE layer (`integrations.inbound` in config.yaml/toml) seeds the
 *   store at boot (`initInboundSettings` from server start);
 * - the OVERRIDE layer (`system_config` rows written through `setConfig`,
 *   the mechanism every admin section uses) re-applies at startup and on
 *   every save, so a toggle survives restarts and a config-file reload
 *   cannot undo it;
 * - reads always see the effective view: override when present, else file.
 *
 * DENY-BY-DEFAULT: an unseeded store reads as the schema defaults — both
 * servers disabled and an empty principal — so a process that never ran the
 * boot wiring refuses every inbound connection. The stdio entrypoints treat
 * an unseeded store exactly like a disabled one; unavailability never
 * widens access.
 */

import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../../admin/config";
import type { IntegrationInboundConfig, } from "../../config/schema/integrations";
import type { DB, } from "../../db/schema";

/** system_config key holding the inbound MCP stdio switch ("true"/"false"). */
export const INBOUND_SETTINGS_MCP_KEY = "integrations.inbound.mcp_enabled";

/** system_config key holding the inbound ACP studio switch ("true"/"false"). */
export const INBOUND_SETTINGS_ACP_KEY = "integrations.inbound.acp_enabled";

/** system_config key holding the inbound principal scope ("read"/"chat-write"). */
export const INBOUND_SETTINGS_SCOPE_KEY = "integrations.inbound.principal_scope";

/** system_config key holding the inbound principal userId. */
export const INBOUND_SETTINGS_USER_KEY = "integrations.inbound.principal_user_id";

/** Effective inbound settings (override layer wins over the file layer). */
export interface InboundSettingsView {
  mcpEnabled: boolean;
  acpEnabled: boolean;
  principalUserId: string;
  principalScope: IntegrationInboundConfig["principalScope"];
}

/** Code defaults — identical to the schema defaults; deny-by-default. */
const CODE_DEFAULTS: InboundSettingsView = {
  mcpEnabled: false,
  acpEnabled: false,
  principalUserId: "",
  principalScope: "read",
};

interface InboundSettingsStoreState {
  seeded: boolean;
  file: IntegrationInboundConfig;
  overrides: Partial<InboundSettingsView>;
}

/** Singleton store — mirrors HarnessAdminSettingsStore (no module-level drift). */
class InboundSettingsStore {
  private state: InboundSettingsStoreState = {
    seeded: false,
    file: { ...CODE_DEFAULTS, },
    overrides: {},
  };

  /** Seed the file layer (idempotent; later calls refresh the file view). */
  init(file: IntegrationInboundConfig,): void {
    this.state.seeded = true;
    this.state.file = file;
  }

  /** Apply an admin save to the override layer. */
  update(patch: InboundSettingsStoreState["overrides"],): void {
    this.state.overrides = { ...this.state.overrides, ...patch, };
  }

  /** Effective view: override when present, else the file layer. */
  get(): InboundSettingsView {
    const o = this.state.overrides;
    return {
      mcpEnabled: o.mcpEnabled ?? this.state.file.mcpEnabled,
      acpEnabled: o.acpEnabled ?? this.state.file.acpEnabled,
      principalUserId: o.principalUserId ?? this.state.file.principalUserId,
      principalScope: o.principalScope ?? this.state.file.principalScope,
    };
  }

  /** Whether the file layer has been seeded (boot availability check). */
  isSeeded(): boolean {
    return this.state.seeded;
  }

  /** Reset to unseeded defaults. Dev/test only. */
  reset(): void {
    this.state = { seeded: false, file: { ...CODE_DEFAULTS, }, overrides: {}, };
  }
}

export const inboundSettings = new InboundSettingsStore();

/**
 * Seed the store's file layer from the loaded `integrations.inbound` config.
 * Called once during server start.
 * @param inbound - the file-config `integrations.inbound` section
 */
export function initInboundSettings(inbound: IntegrationInboundConfig,): void {
  inboundSettings.init(inbound,);
}

/**
 * Read the effective (file + admin override) inbound settings.
 * @returns {InboundSettingsView} the effective view.
 */
export function getInboundSettings(): InboundSettingsView {
  return inboundSettings.get();
}

/**
 * Whether the file layer has been seeded (`initInboundSettings`, boot). The
 * stdio entrypoints refuse to serve while false — the same no-widening rule
 * the harness dispatch guard applies while ITS store is unseeded.
 * @returns true once the file layer is seeded.
 */
export function isInboundSettingsSeeded(): boolean {
  return inboundSettings.isSeeded();
}

/**
 * Overlay the persisted admin overrides from `system_config` onto the store.
 * Called once during server start so a saved toggle survives restart.
 * Malformed rows are ignored (defaults keep flowing), mirroring
 * `applyStoredHarnessSettings`.
 * @param db - database handle
 */
export async function applyStoredInboundSettings(db: Kysely<DB>,): Promise<void> {
  const patch: InboundSettingsStoreState["overrides"] = {};

  const mcpRaw = await getConfigValue(db, INBOUND_SETTINGS_MCP_KEY,);
  if (mcpRaw === "true") { patch.mcpEnabled = true; }
  if (mcpRaw === "false") { patch.mcpEnabled = false; }

  const acpRaw = await getConfigValue(db, INBOUND_SETTINGS_ACP_KEY,);
  if (acpRaw === "true") { patch.acpEnabled = true; }
  if (acpRaw === "false") { patch.acpEnabled = false; }

  const scopeRaw = await getConfigValue(db, INBOUND_SETTINGS_SCOPE_KEY,);
  if (scopeRaw === "read" || scopeRaw === "chat-write") { patch.principalScope = scopeRaw; }

  const userRaw = await getConfigValue(db, INBOUND_SETTINGS_USER_KEY,);
  if (typeof userRaw === "string") { patch.principalUserId = userRaw; }

  if (Object.keys(patch,).length > 0) {
    inboundSettings.update(patch,);
  }
}

/** Reset the store to unseeded defaults. Dev/test only. */
export function resetInboundSettings(): void {
  inboundSettings.reset();
}

/** Description stamped onto the inbound system_config rows. */
const DESCRIPTIONS: Record<string, string> = {
  [INBOUND_SETTINGS_MCP_KEY]: "Enable the inbound MCP stdio server (epic-agentic-integration-mcp-acp §3.3)",
  [INBOUND_SETTINGS_ACP_KEY]: "Enable the inbound ACP studio server (epic-agentic-integration-mcp-acp §3.3)",
  [INBOUND_SETTINGS_SCOPE_KEY]: "Facade tier granted to the inbound principal (read | chat-write)",
  [INBOUND_SETTINGS_USER_KEY]: "userId inbound agentic ops are attributed to",
};

/** The admin-writable settings patch shape. */
type InboundSettingsPatch = Partial<Omit<InboundSettingsView, never>>;

/**
 * Persist an admin settings patch through the existing config save path
 * (`setConfig` into `system_config`) and update the store, so the toggle
 * survives restarts. Scope values outside the vocabulary are rejected —
 * nothing persists.
 * @param db - database handle
 * @param patch - the settings to persist; omitted fields change nothing
 * @returns {Promise<InboundSettingsView>} the effective view after the save.
 * @throws {Error} when `principalScope` is not `read`/`chat-write`
 */
export async function saveInboundAdminSettings(
  db: Kysely<DB>,
  patch: InboundSettingsPatch,
): Promise<InboundSettingsView> {
  if (
    patch.principalScope !== undefined && patch.principalScope !== "read" &&
    patch.principalScope !== "chat-write"
  ) {
    throw new Error(
      `integrations.inbound.principal_scope: "${
        String(patch.principalScope,)
      }" is outside the read|chat-write vocabulary`,
    );
  }

  if (patch.mcpEnabled !== undefined) {
    await setConfig(db, INBOUND_SETTINGS_MCP_KEY, String(patch.mcpEnabled,), DESCRIPTIONS[INBOUND_SETTINGS_MCP_KEY],);
  }

  if (patch.acpEnabled !== undefined) {
    await setConfig(db, INBOUND_SETTINGS_ACP_KEY, String(patch.acpEnabled,), DESCRIPTIONS[INBOUND_SETTINGS_ACP_KEY],);
  }

  if (patch.principalScope !== undefined) {
    await setConfig(db, INBOUND_SETTINGS_SCOPE_KEY, patch.principalScope, DESCRIPTIONS[INBOUND_SETTINGS_SCOPE_KEY],);
  }

  if (patch.principalUserId !== undefined) {
    await setConfig(db, INBOUND_SETTINGS_USER_KEY, patch.principalUserId, DESCRIPTIONS[INBOUND_SETTINGS_USER_KEY],);
  }

  inboundSettings.update(patch,);
  return inboundSettings.get();
}

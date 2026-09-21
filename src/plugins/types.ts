// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Types — Full architectural definitions
 *
 * Reference: docs/spec/plugin-system.md
 * Covers: Plugin, PluginContext, ToolDefinition, AgentRoleDefinition,
 * RouteDefinition, UIComponent, EventHandler, Migration, PluginConfigSchema.
 * @module plugin-types
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";

// ── Core Plugin ──────────────────────────────────────────────

/** Categories of plugin provenance */
export type PluginOrigin = "core" | "community" | "local";

/** A loaded plugin instance */
export interface LoadedPlugin {
  manifest: PluginManifest;
  origin: PluginOrigin;
  directory: string;
}

/**
 * Bundle-declared requirements for the canonical character shape.
 *
 * A plugin that bundles characters (e.g. fantasy-rpg) can declare which
 * `CharacterExtensions` keys are required for any character opting into
 * its bundle. The validator in `bundles.ts` enforces presence (not
 * non-emptiness) so authors can still ship drafts.
 */
export interface BundleCharacterRequirements {
  /** Top-level keys in `CharacterExtensions` that must be present. */
  required?: string[];
  /** Minimum array length for the listed keys (e.g. inventory ≥ 1). */
  minLength?: Record<string, number>;
}

/** Plugin manifest — the exported `plugin` value */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  license?: string;
  onLoad?(context: PluginContext): Promise<void>;
  onUnload?(): Promise<void>;
  tools?: ToolDefinition[];
  agentRoles?: AgentRoleDefinition[];
  apiRoutes?: RouteDefinition[];
  uiComponents?: UIComponentDefinition[];
  eventHandlers?: EventHandlerDefinition[];
  migrations?: MigrationDefinition[];
  configSchema?: PluginConfigSchema;
  /** Per-bundle character extension requirements keyed by bundle id. */
  characterRequirements?: Record<string, BundleCharacterRequirements>;
}

/** Context passed to onLoad */
export interface PluginContext {
  db: Kysely<DB>;
  logger: PluginLogger;
  registerTool(tool: ToolDefinition): void;
  registerAgentRole(role: AgentRoleDefinition): void;
  registerApiRoute(route: RouteDefinition): void;
  registerUiComponent(component: UIComponentDefinition): void;
  registerEventHandler(handler: EventHandlerDefinition): void;
}

// ── Extension Points ─────────────────────────────────────────

/**
 * Per-request context passed to tool handlers by the generation tool loop.
 * Optional for plugin tools; builtin tools (e.g. memory writes) use it to
 * reach the database and the generating actor/chat.
 */
export interface ToolExecutionContext {
  db: Kysely<DB>;
  actorId: string;
  chatId: string;
}

/**
 *
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  handler: (
    params: Record<string, unknown>,
    ctx?: ToolExecutionContext,
  ) => Promise<ToolResult>;
  permissions?: string[];
  timeoutMs?: number;
  sandboxed?: boolean;
}

/**
 *
 */
export interface ToolResult {
  content: string;
  metadata?: Record<string, unknown>;
  isError?: boolean;
}

/**
 *
 */
export interface AgentRoleDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  modelConfig?: Record<string, unknown>;
  memoryConfig?: Record<string, unknown>;
  permissions?: string[];
}

/**
 *
 */
export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: (request: Request) => Promise<Response | null>;
  description?: string;
  requiresAuth?: boolean;
  permissions?: string[];
}

/**
 *
 */
export interface UIComponentDefinition {
  type: "web" | "tui" | "both";
  name: string;
  location: string;
  props?: Record<string, unknown>;
}

/**
 *
 */
export interface EventHandlerDefinition {
  event: string;
  handler: (data: unknown) => Promise<void>;
  description?: string;
}

/**
 *
 */
export interface MigrationDefinition {
  version: number;
  name: string;
  up: (db: Kysely<DB>) => Promise<void>;
  down?: (db: Kysely<DB>) => Promise<void>;
}

/**
 *
 */
export interface PluginConfigSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

// ── Logger subset for plugins ────────────────────────────────

/**
 *
 */
export interface PluginLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

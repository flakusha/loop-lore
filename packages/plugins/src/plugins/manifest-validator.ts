// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin manifest structure validator.
 *
 * Shape-only: every known field is checked for the right primitive shape
 * (non-empty strings, arrays where arrays are expected, handler functions
 * where handlers are required). Unknown fields are ignored — a closed schema
 * is an operator decision, not taken here.
 *
 * @module plugin-manifest-validator
 */

/** Warn callback shape shared by the global and per-plugin loggers. */
export type WarnFn = (msg: string, meta?: Record<string, unknown>) => void;

/**
 * Validate a manifest, warning once when it must be skipped.
 * Keeps the loader's file-size budget: both load paths share this.
 * @param manifest - the imported `plugin` export
 * @param warn - warn call (global or per-plugin logger)
 * @param extra - extra log fields (origin, directory, …)
 * @returns true when the caller must skip this manifest.
 */
export function warnOnInvalidManifest(
  manifest: unknown,
  warn: WarnFn,
  extra?: Record<string, unknown>,
): boolean {
  const errors = validatePluginManifest(manifest,);

  if (errors.length === 0) { return false; }

  const name = typeof manifest === "object" && manifest !== null
    ? (manifest as Record<string, unknown>).name
    : undefined;

  warn(`Invalid plugin manifest — skipping`, { plugin: name, ...extra, errors, },);

  return true;
}

/** A manifest that failed validation, with human-readable reasons. */
export function validatePluginManifest(manifest: unknown,): string[] {
  const errors: string[] = [];
  if (typeof manifest !== "object" || manifest === null) {
    return ["manifest must be an object",];
  }

  const m = manifest as Record<string, unknown>;
  checkString(m, "name", errors, true,);
  checkString(m, "version", errors, true,);
  checkString(m, "description", errors, true,);
  checkString(m, "author", errors, true,);
  checkString(m, "homepage", errors, false,);
  checkString(m, "license", errors, false,);
  checkTools(m.tools, errors,);
  checkAgentRoles(m.agentRoles, errors,);
  checkRoutes(m.apiRoutes, errors,);
  checkNamedHandlers(m.uiComponents, "uiComponents", "location", errors,);
  checkNamedHandlers(m.eventHandlers, "eventHandlers", "event", errors,);
  checkMigrations(m.migrations, errors,);
  if (m.configSchema !== undefined && (typeof m.configSchema !== "object" || m.configSchema === null)) {
    errors.push("configSchema must be an object",);
  }

  if (m.config !== undefined && (typeof m.config !== "object" || m.config === null)) {
    errors.push("config must be an object",);
  }

  if (m.characterRequirements !== undefined && (typeof m.characterRequirements !== "object" || m.characterRequirements === null)) {
    errors.push("characterRequirements must be an object",);
  }

  for (const key of ["onLoad", "onUnload",] as const) {
    if (m[key] !== undefined && typeof m[key] !== "function") {
      errors.push(`${key} must be a function`,);
    }
  }

  return errors;
}

function checkString(
  m: Record<string, unknown>,
  key: string,
  errors: string[],
  required: boolean,
): void {
  const value = m[key];
  if (value === undefined) {
    if (required) { errors.push(`${key} is required`,); }
    return;
  }

  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${key} must be a non-empty string`,);
  }
}

function asArray(value: unknown,): Record<string, unknown>[] | null | undefined {
  if (value === undefined) { return undefined; }
  return Array.isArray(value) ? value as Record<string, unknown>[] : null;
}

function checkTools(tools: unknown, errors: string[],): void {
  const list = asArray(tools,);
  if (list === null) { errors.push("tools must be an array",); return; }
  for (const [i, tool] of (list ?? []).entries()) {
    if (typeof tool !== "object" || tool === null) { errors.push(`tools[${i}] must be an object`,); continue; }
    if (typeof tool.name !== "string" || tool.name.length === 0) {
      errors.push(`tools[${i}].name must be a non-empty string`,);
    }

    if (typeof tool.description !== "string" || tool.description.length === 0) {
      errors.push(`tools[${i}].description must be a non-empty string`,);
    }

    if (typeof tool.parameters !== "object" || tool.parameters === null) {
      errors.push(`tools[${i}].parameters must be an object (JSON Schema)`,);
    }

    if (typeof tool.handler !== "function") {
      errors.push(`tools[${i}].handler must be a function`,);
    }

    if (tool.timeoutMs !== undefined && (typeof tool.timeoutMs !== "number" || tool.timeoutMs <= 0)) {
      errors.push(`tools[${i}].timeoutMs must be a positive number`,);
    }
  }
}

function checkAgentRoles(roles: unknown, errors: string[],): void {
  const list = asArray(roles,);
  if (list === null) { errors.push("agentRoles must be an array",); return; }
  for (const [i, role] of (list ?? []).entries()) {
    if (typeof role !== "object" || role === null) { errors.push(`agentRoles[${i}] must be an object`,); continue; }
    for (const key of ["id", "name", "description", "systemPrompt",] as const) {
      if (typeof role[key] !== "string" || (role[key] as string).length === 0) {
        errors.push(`agentRoles[${i}].${key} must be a non-empty string`,);
      }
    }

    if (!Array.isArray(role.tools)) {
      errors.push(`agentRoles[${i}].tools must be an array`,);
    }
  }
}

function checkRoutes(routes: unknown, errors: string[],): void {
  const list = asArray(routes,);
  if (list === null) { errors.push("apiRoutes must be an array",); return; }
  for (const [i, route] of (list ?? []).entries()) {
    if (typeof route !== "object" || route === null) { errors.push(`apiRoutes[${i}] must be an object`,); continue; }
    if (!["GET", "POST", "PUT", "PATCH", "DELETE",].includes(route.method as string)) {
      errors.push(`apiRoutes[${i}].method must be a valid HTTP method`,);
    }

    if (typeof route.path !== "string" || (route.path as string).length === 0) {
      errors.push(`apiRoutes[${i}].path must be a non-empty string`,);
    }

    if (typeof route.handler !== "function") {
      errors.push(`apiRoutes[${i}].handler must be a function`,);
    }

    if (route.permissions !== undefined) {
      if (!Array.isArray(route.permissions) || !(route.permissions as unknown[]).every((p,) => typeof p === "string")) {
        errors.push(`apiRoutes[${i}].permissions must be an array of strings`,);
      }
    }
  }
}

function checkNamedHandlers(
  list: unknown,
  key: string,
  nameKey: string,
  errors: string[],
): void {
  const arr = asArray(list,);
  if (arr === null) { errors.push(`${key} must be an array`,); return; }
  for (const [i, entry] of (arr ?? []).entries()) {
    if (typeof entry !== "object" || entry === null) { errors.push(`${key}[${i}] must be an object`,); continue; }
    if (typeof entry[nameKey] !== "string" || (entry[nameKey] as string).length === 0) {
      errors.push(`${key}[${i}].${nameKey} must be a non-empty string`,);
    }

    if (typeof entry.handler !== "function" && typeof entry.name !== "string") {
      errors.push(`${key}[${i}] must declare a handler or name`,);
    }
  }
}

function checkMigrations(migrations: unknown, errors: string[],): void {
  const list = asArray(migrations,);
  if (list === null) { errors.push("migrations must be an array",); return; }
  for (const [i, migration] of (list ?? []).entries()) {
    if (typeof migration !== "object" || migration === null) {
      errors.push(`migrations[${i}] must be an object`,);
      continue;
    }

    if (typeof migration.version !== "number") {
      errors.push(`migrations[${i}].version must be a number`,);
    }

    if (typeof migration.up !== "function") {
      errors.push(`migrations[${i}].up must be a function`,);
    }
  }
}

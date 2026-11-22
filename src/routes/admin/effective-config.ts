// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Effective-config export: file-plane + DB-plane merged with omit-and-note redaction.
 *
 * Unlike the DB-only `system-config/export` dump, this route merges the live
 * file-plane `Config` with the persisted `system_config` rows (DB wins on
 * overlap). Every secret-adjacent key is classified by name at every nesting
 * level and named in `omitted` — its value never enters the body. A stored
 * `secret:` envelope that cannot be opened is likewise omitted (never the
 * value-with-warn fallback `openConfigValue` applies on reads).
 */

import { Elysia, t, } from "elysia";
import { isSecretConfigKeyName, } from "../../admin/config";
import { resolveCredential, SECRET_REF_PREFIX, } from "../../integrations/secrets";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requirePermissionUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Marker for a value withheld from the export. Never serialized. */
const OMIT = Symbol("omit",);

/**
 * @param value
 * @returns true for plain JSON records (not arrays, dates, class instances)
 */
function isPlainRecord(value: unknown,): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) { return false; }
  const proto: unknown = Object.getPrototypeOf(value,);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-copy a file-plane value, withholding secret-adjacent keys and
 * unopenable envelopes.
 * @param node the value to project
 * @param path dotted path of `node` ("" at the root)
 * @param omitted collects dotted paths withheld from the export
 * @returns the redacted copy, or OMIT when `node` itself is withheld
 */
async function projectValue(
  node: unknown,
  path: string,
  omitted: string[],
): Promise<unknown> {
  if (typeof node === "string" && node.startsWith(SECRET_REF_PREFIX,)) {
    try {
      return await resolveCredential(node,);
    } catch {
      omitted.push(path,);
      return OMIT;
    }
  }

  if (Array.isArray(node,)) {
    const out: unknown[] = [];
    for (let i = 0; i < node.length; i += 1) {
      const item = await projectValue(node[i], `${path}.${i}`, omitted,);
      if (item !== OMIT) { out.push(item,); }
    }

    return out;
  }

  if (isPlainRecord(node,)) {
    const out: Record<string, unknown> = {};
    for (const [key, val,] of Object.entries(node,)) {
      const child = path === "" ? key : `${path}.${key}`;
      if (isSecretConfigKeyName(key,)) {
        omitted.push(child,);
        continue;
      }

      const projected = await projectValue(val, child, omitted,);
      if (projected !== OMIT) { out[key] = projected; }
    }

    return out;
  }

  return node;
}

/**
 * Set a DB-plane value at its dotted path, creating records as needed.
 * @param root merge target (mutated)
 * @param key dotted DB key (flat keys land top-level)
 * @param value already-opened plain value
 */
function setPath(root: Record<string, unknown>, key: string, value: unknown,): void {
  const parts = key.split(".",);
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next: unknown = node[part];
    if (!isPlainRecord(next,)) {
      const fresh: Record<string, unknown> = {};
      node[part] = fresh;
      node = fresh;
    } else {
      node = next;
    }
  }

  node[parts[parts.length - 1]!] = value;
}

/**
 * @param opts
 * @param prefix
 * @returns Elysia plugin with the effective-config export endpoint.
 */
export function effectiveConfigRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-effective-config", },)
      .get(`${prefix}/admin/effective-config/export`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const values: Record<string, unknown> = {};
        const omitted: string[] = [];

        const projected = await projectValue((opts.config ?? {}) as unknown, "", omitted,);
        if (isPlainRecord(projected,)) { Object.assign(values, projected,); }

        const rows = await opts.database
          .selectFrom("system_config",)
          .select(["key", "value",],)
          .orderBy("key",)
          .execute();

        for (const row of rows) {
          // Secret-adjacent keys are named, never opened, never included.
          if (isSecretConfigKeyName(row.key,)) {
            omitted.push(row.key,);
            continue;
          }

          if (row.value.startsWith(SECRET_REF_PREFIX,)) {
            try {
              setPath(values, row.key, await resolveCredential(row.value,),);
            } catch {
              omitted.push(row.key,);
            }

            continue;
          }

          setPath(values, row.key, row.value,);
        }

        omitted.sort();
        return jsonResponse({ values, omitted, },);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
  );
}

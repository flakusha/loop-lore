// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * External (non-htmx) client API-call collection, validated against the
 * PUBLISHED OpenAPI document instead of the in-repo route table.
 *
 * The in-repo FE pass (fe-calls.ts) covers src/frontend|components|views|
 * partials. External clients — headless/TUI, SDK-ish modules, embeddable
 * engines — live outside those dirs and are enumerated by a checked-in
 * manifest (external-clients.json). Their /api/* calls are checked against
 * `docs/reference/openapi.json` (the spec served at GET /api/v1/openapi/json,
 * regenerated on demand via scripts/generate-openapi.ts), so external callers
 * break loudly when the published contract drifts away from them.
 *
 * Blocking findings: call whose method+path is absent from the published
 * document, path hit with a method the document does not publish, stale
 * manifest entry (nonexistent file), unreadable/invalid manifest.
 * Manifest `allowlist` entries (method + path + mandatory reason) mark
 * documented exceptions, e.g. routes served by createApp but outside the
 * spec-collected v1Routes/registerPlugins surface.
 */

import { existsSync, readFileSync, } from "node:fs";
import path from "node:path";
import { callExtent, lineOf, ROOT, samePath, } from "./shared";

export const MANIFEST_REL = "scripts/fe-be-harmonization/external-clients.json";
export const SPEC_REL = "docs/reference/openapi.json";

/** Checked-in manifest enumerating external client files and exceptions. */
export interface ExternalClientManifest {
  clients: string[];
  allowlist: Array<{ method: string; path: string; reason: string }>;
}

/** One extracted external call site. */
export interface ExternalCall {
  method: string;
  /** Normalized path: /api root kept, ${...} → :param, query stripped. */
  path: string;
  raw: string;
  file: string;
  line: number;
}

/** Minimal published-OpenAPI-document shape used for matching. */
export interface PublishedSpec {
  paths: Record<string, Record<string, unknown>>;
}

export interface ExternalScanResult {
  calls: ExternalCall[];
  /** Manifest client entries whose file does not exist (stale manifest). */
  missing: string[];
}

/** Read + validate the manifest; parse/shape problems surface as errors. */
export function readExternalManifest(rel = MANIFEST_REL,): {
  manifest: ExternalClientManifest;
  errors: string[];
} {
  const abs = path.join(ROOT, rel,);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8",),);
  } catch (e) {
    return {
      manifest: { clients: [], allowlist: [], },
      errors: [`${rel}: unreadable manifest (${(e as Error).message}).`,],
    };
  }
  const errors: string[] = [];
  const m = (parsed ?? {}) as Partial<ExternalClientManifest>;
  if (!Array.isArray(m.clients,)) {
    errors.push(`${rel}: "clients" must be an array of repo-relative file paths.`,);
  }
  if (!Array.isArray(m.allowlist,) && m.allowlist !== undefined) {
    errors.push(`${rel}: "allowlist" must be an array of {method, path, reason}.`,);
  }
  const clients = Array.isArray(m.clients,) ? m.clients : [];
  const allowlistRaw = Array.isArray(m.allowlist,) ? m.allowlist : [];
  const allowlist = allowlistRaw.filter((a,) =>
    typeof a?.method === "string" && typeof a?.path === "string" &&
    typeof a?.reason === "string"
  );
  if (allowlist.length !== allowlistRaw.length) {
    errors.push(`${rel}: every allowlist entry needs method, path and reason.`,);
  }
  return { manifest: { clients, allowlist, }, errors, };
}

/** Normalize a spec template path: {id} → :id, so samePath() matches calls. */
export function normSpecPath(p: string,): string {
  return p.replace(/\{[^}]+\}/g, (seg,) => `:${seg.slice(1, -1,)}`,);
}

/** Normalize an extracted call path: keep /api root, ${} → :param, strip query. */
export function normCallPath(raw: string,): string {
  const i = raw.indexOf("/api",);
  let p = i >= 0 ? raw.slice(i,) : raw;
  p = p.split("?",)[0] ?? p;
  p = p.replace(/\$\{[^}]*\}/g, "/:param",);
  p = p.replace(/\/\/+/g, "/",);
  if (!p.startsWith("/",)) { p = `/${p}`; }
  return p.replace(/\/$/, "",) || "/";
}

/**
 * Extract method+path call sites from one client file. Method inference:
 * callee name prefix (postJson → POST, getJson → GET), else `method:` in the
 * call window, else GET.
 */
function scanFile(file: string,): ExternalCall[] {
  const abs = path.join(ROOT, file,);
  const src = readFileSync(abs, "utf8",);
  const out: ExternalCall[] = [];
  const re = /\b([A-Za-z_$][\w$]*)\s*\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src,)) !== null) {
    const lit = m[2] ?? "";
    const content = lit.slice(1, -1,);
    if (!content.includes("/api",)) { continue; }
    const callee = m[1] ?? "";
    const win = callExtent(src, m.index,);
    const mm = /method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/i.exec(win,);
    const method = /^post/i.test(callee,)
      ? "POST"
      : /^get/i.test(callee,)
      ? "GET"
      : (mm?.[1] ?? "GET").toUpperCase();
    const i = content.indexOf("/api",);
    const raw = content.slice(i, i + 90,);
    out.push({
      method,
      path: normCallPath(content,),
      raw,
      file,
      line: lineOf(src, m.index,),
    },);
  }
  return out;
}

/** Scan every manifest client file; nonexistent files land in `missing`. */
export function scanExternalCalls(clients: string[],): ExternalScanResult {
  const calls: ExternalCall[] = [];
  const missing: string[] = [];
  for (const f of clients) {
    if (!existsSync(path.join(ROOT, f,),)) {
      missing.push(f,);
      continue;
    }
    calls.push(...scanFile(f,),);
  }
  return { calls, missing, };
}

/**
 * Validate external calls against the published document. Returns blocking
 * findings (file:line-prefixed, matching the in-repo pass format).
 */
export function externalFindings(
  manifest: ExternalClientManifest,
  scan: ExternalScanResult,
  spec: PublishedSpec,
): string[] {
  const blocking: string[] = [];
  for (const f of scan.missing) {
    blocking.push(
      `${MANIFEST_REL}:0 [blocking] stale manifest: client file "${f}" does not exist; fix or remove the entry.`,
    );
  }
  for (const c of scan.calls) {
    const allowlisted = manifest.allowlist.some((a,) =>
      a.method.toUpperCase() === c.method && samePath(normSpecPath(a.path,), c.path,)
    );
    if (allowlisted) { continue; }
    const hits = Object.entries(spec.paths ?? {},).filter(([p,],) => samePath(normSpecPath(p,), c.path,));
    if (hits.length === 0) {
      blocking.push(
        `${c.file}:${c.line} [blocking] external-no-contract: ${c.method} ${c.raw} — path not in the published OpenAPI document; add the route to the spec or fix the caller.`,
      );
      continue;
    }
    const methods = new Set(
      hits.flatMap(([, ops,],) => Object.keys(ops ?? {},).map((k,) => k.toUpperCase())),
    );
    if (!methods.has(c.method,)) {
      blocking.push(
        `${c.file}:${c.line} [blocking] external-method-mismatch: ${c.method} ${c.raw} vs published ${
          [...methods,].sort().join("/",)
        }; align method.`,
      );
    }
  }
  return blocking;
}

/**
 * Load the published OpenAPI document, regenerating it on demand via
 * scripts/generate-openapi.ts (in-memory DB, no listener). Throws when the
 * document cannot be produced — callers turn that into a blocking finding.
 */
export function ensureSpec(rel = SPEC_REL,): PublishedSpec {
  const abs = path.join(ROOT, rel,);
  if (!existsSync(abs,)) {
    const proc = Bun.spawnSync(["bun", "run", "scripts/generate-openapi.ts",], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "development", },
      stdout: "pipe",
      stderr: "pipe",
    },);
    if (proc.exitCode !== 0 || !existsSync(abs,)) {
      throw new Error(
        `published OpenAPI document missing and regeneration failed (exit ${proc.exitCode}): ${
          new TextDecoder().decode(proc.stderr ?? new Uint8Array(),).trim()
        }`,
      );
    }
  }
  const spec = JSON.parse(readFileSync(abs, "utf8",),) as PublishedSpec;
  if (typeof spec?.paths !== "object" || spec.paths === null) {
    throw new Error(`${rel} is not an OpenAPI document with paths.`,);
  }
  return spec;
}

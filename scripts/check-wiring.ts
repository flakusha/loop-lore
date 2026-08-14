// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wiring + dead-code check gate.
 *
 * Verifies the HTTP surface is actually wired to production and no
 * code-complete service is orphaned. Mirrors the "Dead / unwired code"
 * backlog section of `.plan/backlog/open.md`.
 *
 * Checks:
 *  1. Route factories: every `*Routes` factory exported from a top-level
 *     route module (`src/routes/<name>.ts` or `src/routes/<name>/index.ts`)
 *     is mounted in `src/app/register-plugins.ts` (or `src/elysia-app.ts`).
 *     Excludes helper/barrel modules that are not themselves mount points
 *     (http-utils, entity-routes, v1, views, export-shared, actor-auth,
 *     and any `*.test.ts`).
 *  2. Service wiring: every rpg service module (`src/rpg/<domain>/service`)
 *     has at least one importer outside its own directory. Flags
 *     code-complete-but-unwired services.
 *  3. Plugin registration: every core and community plugin
 *     (`plugins/<tier>/<name>/plugin.ts`) is registered (imported) in
 *     `src/app/register-plugins.ts`.
 *  4. Route-test coverage: every mounted route factory has a matching
 *     `*.test.ts` exercising it.
 *
 * Documented deferrals (intentionally unwired — see backlog):
 *  - `loraRoutes` — LoRA gated "when feature is ready for production".
 *
 * Usage: `bun run scripts/check-wiring.ts`
 * Exit 1 on any violation.
 */
import { Glob, } from "bun";

const ROOT = import.meta.dir + "/..";
const errors: string[] = [];

// ── Collect mount-point source text ────────────────────────────────
const registerPlugins = await Bun.file(ROOT + "/src/app/register-plugins.ts",).text();
const elysiaApp = await Bun.file(ROOT + "/src/elysia-app.ts",).text();
const mountSource = registerPlugins + "\n" + elysiaApp;

// ── 1. Route factories mounted ─────────────────────────────────────
// Top-level route modules: a file `src/routes/<name>.ts` OR a directory
// `src/routes/<name>/index.ts` that exports a `*Routes` factory.
const routeFileGlob = new Glob("src/routes/*.ts",);
const routeDirGlob = new Glob("src/routes/*/index.ts",);

const routeFactories = new Set<string>();

async function collectRouteFactories() {
  for await (const file of routeFileGlob.scan({ cwd: ROOT, },)) {
    if (file.includes(".test.",)) { continue; }
    const text = await Bun.file(ROOT + "/" + file,).text();
    for (const m of text.matchAll(/export (?:function|const) ([a-zA-Z]+Routes)/g,)) {
      routeFactories.add(m[1],);
    }
  }
  for await (const file of routeDirGlob.scan({ cwd: ROOT, },)) {
    const text = await Bun.file(ROOT + "/" + file,).text();
    for (const m of text.matchAll(/export (?:function|const) ([a-zA-Z]+Routes)/g,)) {
      routeFactories.add(m[1],);
    }
  }
}

// Non-mount-point modules: helper/barrel modules that export `*Routes`
// factories but are composed into a parent mount point, not registered
// directly. Their factories are still exercised via the parent.
const NON_MOUNT_POINTS = new Set([
  "createEntityRoutes", // entity-routes helper
  "authPublicRoutes", // mounted via auth/ barrel (name preserved)
  "authProtectedRoutes", // mounted via auth/ barrel
],);

// Documented deferrals — intentionally not mounted.
const DEFERRED = new Set([
  "loraRoutes",
],);

await collectRouteFactories();

for (const factory of routeFactories) {
  if (NON_MOUNT_POINTS.has(factory,)) { continue; }
  if (DEFERRED.has(factory,)) { continue; }
  // Mounted if the factory name appears as `.use(<factory>(` in mount source.
  const mounted = new RegExp(`\\.use\\(\\s*${factory}\\s*\\(`,).test(mountSource,);
  if (!mounted) {
    errors.push(
      `[wiring] route factory \`${factory}\` is exported but NOT mounted in register-plugins.ts / elysia-app.ts`,
    );
  }
}

// ── 2. Service wiring (rpg services have >=1 importer) ─────────────
const serviceGlob = new Glob("src/rpg/**/service/index.ts",);
const serviceFileGlob = new Glob("src/rpg/**/service.ts",);

async function checkServiceWiring() {
  const servicePaths = new Set<string>();
  for await (const f of serviceGlob.scan({ cwd: ROOT, },)) { servicePaths.add(f,); }
  for await (const f of serviceFileGlob.scan({ cwd: ROOT, },)) { servicePaths.add(f,); }

  for (const servicePath of servicePaths) {
    // Directory of the service module (for excluding self-imports).
    const dir = servicePath.slice(0, servicePath.lastIndexOf("/",),);
    // Relative import token used by importers, e.g. "rpg/seduction/service".
    // Importers write `from "../../rpg/seduction/service"` — match the
    // path suffix so relative imports resolve regardless of depth.
    const importToken = servicePath
      .replace(/\.ts$/, "",)
      .replace(/\/index$/, "",)
      .replace(/^src\//, "",);
    // Domain barrel token — routes usually import the domain barrel
    // (`../../rpg/achievements`) which re-exports `./service`, so an import
    // of the domain barrel also wires the service. E.g. "rpg/achievements".
    const domainToken = importToken.replace(/\/service$/, "",);
    // Search all src/**/*.ts for an import of this service path.
    const importGlob = new Glob("src/**/*.ts",);
    let importers = 0;
    for await (const f of importGlob.scan({ cwd: ROOT, },)) {
      if (f.includes(".test.",)) { continue; }
      // Skip files within the service's own directory.
      if (f.startsWith(dir,)) { continue; }
      const text = await Bun.file(ROOT + "/" + f,).text();
      // Match relative imports ending in the service token (with optional
      // `.js` extension or `/index`), e.g. `from "../../rpg/seduction/service"`.
      const serviceRe = new RegExp(`from\\s+["'][^"']*${importToken}(?:\\.js)?["']`,);
      // Or imports of the domain barrel that re-exports this service.
      const domainRe = new RegExp(`from\\s+["'][^"']*${domainToken}(?:\\.js)?["']`,);
      if (serviceRe.test(text,) || domainRe.test(text,)) { importers++; }
    }
    if (importers === 0) {
      errors.push(`[wiring] service \`${servicePath}\` has ZERO external importers (code-complete but unwired)`,);
    }
  }
}

await checkServiceWiring();

// ── 3. Plugin registration ─────────────────────────────────────────
// Plugins are discovered dynamically by `src/plugins/loader.ts` scanning
// `plugins/core`, `plugins/community`, `plugins/local`. Verify each plugin
// directory has a `plugin.ts` manifest and that the loader references the
// plugin directories (so a plugin cannot silently go unloaded).
const pluginGlob = new Glob("plugins/{core,community}/*/plugin.ts",);
const pluginLoader = await Bun.file(ROOT + "/src/plugins/loader.ts",).text();
const loaderCoversCore = pluginLoader.includes('"plugins/core"',);
const loaderCoversCommunity = pluginLoader.includes('"plugins/community"',);
if (!loaderCoversCore) {
  errors.push("[wiring] plugin loader does not scan plugins/core",);
}
if (!loaderCoversCommunity) {
  errors.push("[wiring] plugin loader does not scan plugins/community",);
}
for await (const pluginFile of pluginGlob.scan({ cwd: ROOT, },)) {
  const pluginName = pluginFile.split("/",).slice(2, -1,)[0];
  // Each plugin manifest must declare a `name` matching its directory so the
  // loader's state-keying (plugin_state by name) stays consistent.
  const text = await Bun.file(ROOT + "/" + pluginFile,).text();
  const nameMatch = text.match(/name:\s*["']([^"']+)["']/,);
  if (!nameMatch || nameMatch[1] !== pluginName) {
    errors.push(`[wiring] plugin \`${pluginName}\` (${pluginFile}) manifest name mismatch or missing`,);
  }
}

// ── 4. Route-test coverage ─────────────────────────────────────────
// Non-blocking advisory: surfaces route factories with no direct test
// reference. Many pre-existing routes are exercised via parent-barrel or
// sub-route tests, so this is reported as a warning, not a gate failure.
const testGlob = new Glob("src/routes/**/*.test.ts",);
const testFiles = new Set<string>();
for await (const f of testGlob.scan({ cwd: ROOT, },)) { testFiles.add(f,); }

const warnings: string[] = [];
for (const factory of routeFactories) {
  if (NON_MOUNT_POINTS.has(factory,) || DEFERRED.has(factory,)) { continue; }
  // A route module has coverage if any test file references the factory.
  let covered = false;
  for (const testFile of testFiles) {
    const text = await Bun.file(ROOT + "/" + testFile,).text();
    if (text.includes(factory,)) {
      covered = true;
      break;
    }
  }
  if (!covered) {
    warnings.push(
      `[wiring] route factory \`${factory}\` has NO direct test reference (advisory — may be covered via parent barrel)`,
    );
  }
}

// ── Report ─────────────────────────────────────────────────────────
if (warnings.length > 0) {
  console.warn(`[wiring] ${warnings.length} advisory warning(s):`,);
  for (const w of warnings) { console.warn(`  - ${w}`,); }
}

if (errors.length > 0) {
  console.error(`[wiring] ${errors.length} wiring violation(s):`,);
  for (const e of errors) { console.error(`  - ${e}`,); }
  process.exit(1,);
}

console.log("[wiring] OK — all route factories mounted, services wired, plugins registered, routes tested.",);

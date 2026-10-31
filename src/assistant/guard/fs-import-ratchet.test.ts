// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ratchet for the fs-interception defect class of the assistant tool guard.
 *
 * WHY THIS EXISTS
 *
 * The sandbox (Layer 3) enforces the filesystem allowlist by patching the CJS
 * module objects `require("node:fs")` and `require("node:fs/promises")` return
 * - the very objects `import fs from "node:fs"` binds. A member lookup on that
 * object happens at CALL time, so the patch applies no matter when the
 * consumer was linked.
 *
 * A static NAMED import (`import { readFileSync } from "node:fs"`) binds the
 * FUNCTION at ESM link time, before any patch can land. Such a call is NEVER
 * intercepted: the guard does not refuse it, it does not warn about it, it
 * simply does not see it. The module is silently OUTSIDE the fs allowlist.
 * That is how the original defect shipped - a reachable module read and wrote
 * the filesystem with no error and no log line.
 *
 * The same holds for a re-export: `export { x } from "node:fs"` and
 * `export * from "node:fs"` hand the ORIGINAL function to the consumer (probed
 * on this runtime: the re-exported member is NOT the patched one), so a module
 * that imports the re-exported name is outside the allowlist too.
 *
 * NOT violations, each verified by an executed probe on this runtime:
 * - `require("node:fs")` - the destructured member IS the patched member.
 * - `await import("node:fs")` - the namespace is a separate object, but the
 *   member it hands out is the patched one (the patch lands at module load,
 *   before any dynamic import runs).
 * - `import * as fs from "node:fs"` - same: the namespace member is patched.
 * Only a static NAME binding escapes the patch.
 *
 * So a new module that names an fs member is a defect until proven otherwise:
 * it must either use the default-import form (`fs.readFileSync(...)`), which
 * the sandbox intercepts, or be consciously listed in BASELINE below with the
 * reason it is unreachable from a command handler.
 *
 * The scan reads the production `src/` tree, skips `*.test.ts` (the repo's
 * convention for "not production code" - the same rule the other static gates
 * use) and looks for named fs bindings in the TRANSPILED source, so a type-only
 * import (`import type { Dirent } from "node:fs"`) is not mistaken for a value
 * binding. A match counts only when the import/export keyword starts a
 * statement, so a mention inside a comment or inside a string is not mistaken
 * for an import.
 *
 * The second test pins the property the ratchet rests on: the default-import
 * form binds the SAME object the sandbox patches, so the allowlist really does
 * apply to it.
 */
import { describe, expect, test, } from "bun:test";
import fs from "node:fs";
import { createRequire, } from "node:module";
import { tmpdir, } from "node:os";
import { join, relative, resolve, } from "node:path";
import { runInSandbox, } from "./sandbox";

/** The production source root (`src/`), two levels above `src/assistant/guard/`. */
const SRC_ROOT = resolve(import.meta.dir, "..", "..",);

/**
 * A static binding of an fs member by name - the form the sandbox cannot
 * intercept. Matches `import { x } from "node:fs"`, `import fs, { x } from
 * "node:fs/promises"`, `export { x } from "node:fs"`, `export * from
 * "node:fs"` and the bare `"fs"` / `"fs/promises"` specifiers (the same
 * module objects, so the same defect).
 */
const NAMED_FS_BINDING =
  /(?:^|[\s;}])(import|export)\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?(?:\*|\{[^}]*\})\s*from\s*["']((?:node:)?fs(?:\/promises)?)["']/gm;

/** A mention of an fs module specifier - the cheap pre-filter before transpiling. */
const FS_SPECIFIER = /["'](?:node:)?fs(?:\/promises)?["']/;

/** The keyword must sit at the start of a statement, not inside one. */
const STATEMENT_BOUNDARY = /[;{}]$/;

/**
 * Every production module in the tree that binds an fs member by name.
 *
 * These are the modules the sandbox CANNOT police. They are not defects by
 * themselves - a module no command handler can reach is harmless - but adding
 * one is a decision that has to be made on purpose, which is what this
 * ratchet forces.
 */
const BASELINE = [
  "src/assets/serve-file.ts",
  "src/assets/test-helpers.ts",
  "src/assets/variant-path.ts",
  "src/build/compress.ts",
  "src/build/copy-icons.ts",
  "src/build/egui-artifact.ts",
  "src/build/identity.ts",
  "src/characters/seed/avatar.ts",
  "src/characters/seed/promote.ts",
  "src/config/cert.ts",
  "src/config/generate-character-schema/index.ts",
  "src/config/generate-domain-schemas.ts",
  "src/config/generate-env-schema.ts",
  "src/config/generate-schema.ts",
  "src/config/generate-toml-schema.ts",
  "src/config/hot-reload.ts",
  "src/config/template-expansion/discovery.ts",
  "src/content/hash-injection.ts",
  "src/db/migrate.ts",
  "src/db/reinit-archive.ts",
  "src/db/reinit.ts",
  "src/federation/storage-quota.ts",
  "src/federation/storage-reconcile.ts",
  "src/frontend/alpine/i18n.test-helper.ts",
  "src/generation/workflow-library/seed.ts",
  "src/generation/workflow-loader/loader.ts",
  "src/harness/query.ts",
  "src/harness/worktree-scope.ts",
  "src/i18n/locale-loader.ts",
  "src/integrations/harness/fake-acp-server.ts",
  "src/native/loader.ts",
  "src/plugins/loader.ts",
  "src/routes/assets.ts",
  "src/routes/characters/export.ts",
  "src/routes/views/character-edit-form.ts",
  "src/routes/views/constants.ts",
  "src/routes/views/hashed-assets.ts",
  "src/routes/views/layout.ts",
  "src/routes/views/static-partials.ts",
  "src/server/init-asset-compression.ts",
  "src/server/static-files.ts",
  "src/server/static-mime.ts",
  "src/services/server-external-manager/start-llama.ts",
  "src/test-utils/isolate-only.ts",
  "src/utils/package-json.ts",
];

/**
 * Collect every production `.ts` file under a directory.
 * @param dir - The directory to walk
 * @param out - The accumulator the found paths are pushed onto
 * @returns The accumulator
 */
function productionFiles(dir: string, out: string[] = [],): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, },)) {
    const full = join(dir, entry.name,);
    if (entry.isDirectory()) {
      productionFiles(full, out,);
      continue;
    }

    if (!entry.name.endsWith(".ts",) || entry.name.endsWith(".test.ts",)) { continue; }
    out.push(full,);
  }

  return out;
}

/**
 * Find the production modules that bind an fs member by name.
 *
 * The source is transpiled first: the transpiler drops type-only imports and
 * comments and keeps the value imports verbatim, so the scan sees what the
 * runtime would link, not what the file merely mentions.
 * @returns The repo-relative paths of the offending modules, sorted
 */
function namedFsImportFiles(): string[] {
  const transpiler = new Bun.Transpiler({ loader: "ts", },);
  const found: string[] = [];
  for (const file of productionFiles(SRC_ROOT,)) {
    const source = fs.readFileSync(file, "utf8",);
    if (!FS_SPECIFIER.test(source,)) { continue; }
    const compiled = transpiler.transformSync(source,);
    if (bindsFsMemberByName(compiled,)) { found.push(`src/${relative(SRC_ROOT, file,)}`,); }
  }

  return found.sort();
}

/**
 * True when the compiled source binds an fs member by name.
 *
 * A match inside a string literal is rejected: the import/export keyword has
 * to start a statement, so a mention inside a string or a template literal
 * does not read as an import.
 * @param compiled - The transpiled source
 * @returns true when the source binds an fs member by name
 */
function bindsFsMemberByName(compiled: string,): boolean {
  for (const match of compiled.matchAll(NAMED_FS_BINDING,)) {
    const start = match.index ?? 0;
    // The match starts at the statement boundary, so the keyword position is
    // what decides which line the import sits on.
    const keywordPos = start + match[0].indexOf(match[1] ?? "import",);
    const lineStart = compiled.lastIndexOf("\n", keywordPos,) + 1;
    const before = compiled.slice(lineStart, keywordPos,).trim();
    if (before === "" || STATEMENT_BOUNDARY.test(before,)) { return true; }
  }

  return false;
}

describe("fs import ratchet", () => {
  test("no production module adds a static named fs import", () => {
    const found = namedFsImportFiles();
    const added = found.filter((file,) => !BASELINE.includes(file,));
    const removed = BASELINE.filter((file,) => !found.includes(file,));

    const message = [
      added.length > 0
        ? `New module(s) bind an fs member by name, so the sandbox cannot intercept them:\n${
          added.map((file,) => `  ${file}`).join("\n",)
        }\nConvert them to the default-import form (import fs from "node:fs"; fs.readFileSync(...)), or add them to BASELINE in this file when they are unreachable from a command handler.`
        : "",
      removed.length > 0
        ? `These BASELINE entries no longer bind an fs member by name - delete them from BASELINE in this file:\n${
          removed.map((file,) => `  ${file}`).join("\n",)
        }`
        : "",
    ].filter((part,) => part.length > 0).join("\n\n",);

    expect(added, message,).toEqual([],);
    expect(removed, message,).toEqual([],);
  });

  test("the default-import form binds the object the sandbox patches", async () => {
    const requireFs = createRequire(import.meta.url,);
    expect(fs, "the default import and require() must be the same module object",).toBe(requireFs("node:fs",),);

    const root = fs.mkdtempSync(join(tmpdir(), "loop-lore-fs-ratchet-",),);
    const allowed = join(root, "allowed",);
    const blocked = join(root, "blocked",);
    fs.mkdirSync(allowed,);
    fs.mkdirSync(blocked,);
    const blockedFile = join(blocked, "secret.txt",);
    fs.writeFileSync(blockedFile, "secret",);
    const allowedFile = join(allowed, "public.txt",);
    fs.writeFileSync(allowedFile, "public",);

    try {
      await expect(
        runInSandbox(
          {
            tool: "fs-import-ratchet",
            allowedNetworkHosts: [],
            allowedFsReadPaths: [allowed,],
            allowedFsWritePaths: [allowed,],
            limits: { timeoutMs: 5_000, memoryMb: 64, },
          },
          async () => {
            fs.readFileSync(blockedFile, "utf8",);
          },
        ),
      ).rejects.toThrow(/403 Forbidden in sandbox/,);

      // The read INSIDE the allowlist still succeeds: the patch polices the
      // scope, it does not break the legitimate call. Without this the test
      // would also pass against a sandbox that refuses EVERY read.
      await runInSandbox(
        {
          tool: "fs-import-ratchet",
          allowedNetworkHosts: [],
          allowedFsReadPaths: [allowed,],
          allowedFsWritePaths: [allowed,],
          limits: { timeoutMs: 5_000, memoryMb: 64, },
        },
        async () => {
          expect(fs.readFileSync(allowedFile, "utf8",),).toBe("public",);
        },
      );

      expect(fs.readFileSync(blockedFile, "utf8",),).toBe("secret",);
    } finally {
      fs.rmSync(root, { recursive: true, force: true, },);
    }
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guards app-installed globals against `delete` in test teardowns.
 *
 * Several modules install a global at import time so the browser bundle and the
 * test process see the same surface: `__DOMPurify`/`__marked`
 * (chat-vendor.ts), `__localeStrings` (ui.ts, alpine/app.ts, routes/views/
 * layout.ts), `__THEMES` (alpine/theme.ts), `loadNewChatPage`
 * (pages/new-chat/index.ts) and `__previewAsset` (asset-preview.ts,
 * chat-utils/gallery.ts).
 *
 * A test that does `delete globalThis.__DOMPurify` to force a fallback path
 * leaves the global absent for every later file sharing the process, whether or
 * not that file re-imports the installer. Tests that need the "absent"
 * precondition must snapshot the load-time value and restore it, not delete it -
 * see chat-editing.test.ts and chat-generations.test.ts for the two shapes that
 * are correct.
 *
 * Note on severity: as of 2026-10-01 this is a hygiene guard, not a regression
 * fix. In a plain `bun test` run none of these globals is installed at all (no
 * non-test module is reached before the suite executes), and the consumers that
 * read them - render.ts via its lazy getters, for one - install their own fakes
 * or fall back to an intended path. Measured pre/post, the failing-test set of
 * the frontend suite is identical. The rule is enforced so that adding the
 * restores cannot silently become load-bearing again; it should not be cited as
 * evidence of a fixed defect.
 */
import { expect, test, } from "bun:test";
import { readdirSync, readFileSync, statSync, } from "node:fs";
import { join, } from "node:path";

const APP_GLOBALS: readonly string[] = [
  "__DOMPurify",
  "__marked",
  "__localeStrings",
  "__THEMES",
  "__previewAsset",
  "loadNewChatPage",
];

function testFiles(dir: string, acc: string[] = [],): string[] {
  for (const entry of readdirSync(dir,)) {
    const full = join(dir, entry,);
    if (statSync(full,).isDirectory()) {
      testFiles(full, acc,);
    } else if (entry.endsWith(".test.ts",)) {
      acc.push(full,);
    }
  }

  return acc;
}

test("a test that deletes an app-installed global must also restore it", () => {
  const offenders: string[] = [];
  for (const file of testFiles(import.meta.dir,)) {
    const rel = file.slice(import.meta.dir.length + 1,);
    if (rel === "app-globals.test.ts") { continue; }
    const src = readFileSync(file, "utf8",);
    for (const global of APP_GLOBALS) {
      // `delete globalThis.X`, `delete globalThis["X"]`, and the typed-cast
      // spellings tests actually use.
      const re = new RegExp(
        `delete\\s*\\(?\\s*\\(?globalThis(?:\\s+as\\s+[^)]*)?\\)?\\s*(?:\\.${global}|\\["${global}"\\])`,
      );

      if (!re.test(src,)) { continue; }
      // Deleting is only safe when the same file puts the value back. A delete
      // used purely as a test precondition is fine if the file snapshots the
      // load-time value and restores it in afterEach/afterAll; a delete with no
      // matching restore is the shape this rule rejects.
      const restores = new RegExp(
        `(?:\\.${global}|\\["${global}"\\])\\s*=\\s*(?!undefined|real|original)`,
      );

      if (!restores.test(src,)) {
        offenders.push(`${rel} deletes ${global} and never restores it`,);
      }
    }
  }

  expect(offenders,).toEqual([],);
});

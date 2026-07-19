// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HTML script-block size guard.
 *
 * Flags `<script>` blocks exceeding a line threshold in HTML files.
 * Large inline scripts should be extracted to frontend TS files
 * (src/frontend/*.ts) and loaded via <script src="..."> tags.
 *
 * Server-injected mustache templates ({{var}}) are exempt — they
 * cannot be moved to client-side TS.
 *
 * Exit 1 if any file exceeds the limit (blocking in CI).
 * Exit 0 with warnings if under limit.
 */
import { Glob, } from "bun";

const LIMIT = 10; // max lines inside a <script> block
const glob = new Glob("src/**/*.html",);

let violations = 0;
let warnings = 0;

for await (const file of glob.scan()) {
  const text = await Bun.file(file,).text();
  const lines = text.split("\n",);

  let inScript = false;
  let scriptStart = 0;
  let scriptLines = 0;
  let hasMustache = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes("<script",)) {
      inScript = true;
      scriptStart = i + 1; // 1-indexed
      scriptLines = 0;
      hasMustache = false;
      continue;
    }

    if (inScript) {
      scriptLines++;
      if (trimmed.includes("{{",)) { hasMustache = true; }
    }

    if (trimmed.includes("</script>",) && inScript) {
      inScript = false;

      // Exempt: server-injected mustache templates (2-3 lines, single assignment)
      if (hasMustache && scriptLines <= 5) { continue; }

      if (scriptLines > LIMIT) {
        console.error(
          `[html-scripts] ${file}:${scriptStart} — <script> block is ${scriptLines}L (limit: ${LIMIT}L). Extract to src/frontend/*.ts.`,
        );
        violations++;
      } else if (scriptLines > 5) {
        console.warn(
          `[html-scripts] ${file}:${scriptStart} — <script> block is ${scriptLines}L. Consider extracting to src/frontend/*.ts.`,
        );
        warnings++;
      }
    }
  }
}

if (violations > 0) {
  console.error(
    `[html-scripts] ${violations} block(s) exceed ${LIMIT}L — extract inline scripts to frontend TS files.`,
  );
  process.exit(1,);
}

if (warnings > 0) {
  console.warn(`[html-scripts] ${warnings} block(s) near limit. Consider extracting to frontend TS files.`,);
}

process.exit(0,);

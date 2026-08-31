// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Copy selected Tabler Icons from node_modules to dist/public/icons/tabler/.
 *
 * Run: bun run src/build/copy-icons.ts
 *
 * Standalone SVGs in dist serve <img>/<object> references.
 * Header buttons use inline SVGs directly in HTML templates.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { createLogger, } from "../logger";

/** Icons used in the app — add new icons here as needed. */
const ICONS = [
  "photo",
  "adjustments",
  "messages",
  "info-circle",
  "settings",
  "brain",
  "player-pause",
  "player-play",
] as const;

const SRC_DIR = join(import.meta.dir, "../../node_modules/@tabler/icons/icons/outline",);
const DEST_DIR = join(import.meta.dir, "../../dist/public/icons/tabler",);

/** */
function main() {
  const log = createLogger({ level: "info", },);

  mkdirSync(DEST_DIR, { recursive: true, },);

  let copied = 0;
  let skipped = 0;

  for (const name of ICONS) {
    const src = join(SRC_DIR, `${name}.svg`,);
    const dest = join(DEST_DIR, `${name}.svg`,);

    if (!existsSync(src,)) {
      log.warn(`Icon not found: ${name} — skipping`,);
      skipped++;
      continue;
    }

    let svg = readFileSync(src, "utf8",);

    // Strip Tabler class attributes — btn-icon handles styling
    svg = svg.replaceAll(/\s+class="[^"]*"/g, "",);

    // Ensure consistent attributes for inline use
    if (!svg.includes('width="24"',)) {
      svg = svg.replaceAll("<svg", '<svg width="24" height="24"',);
    }

    writeFileSync(dest, svg, "utf8",);
    copied++;
  }

  const suffix = skipped > 0 ? ` (${skipped} skipped)` : "";
  log.info(`Copied ${copied} icons to ${DEST_DIR}${suffix}`,);
}

main();

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import { ALLOWED_PARTIALS, COMPONENTS_DIR, PARTIALS_DIR, } from "./constants";

function serveStaticPartial(name: string, searchParams?: URLSearchParams,): string | null {
  if (!ALLOWED_PARTIALS.has(name,)) { return null; }

  const partialPath = join(PARTIALS_DIR, `${name}.html`,);
  if (existsSync(partialPath,)) {
    let content = readFileSync(partialPath, "utf8",);
    if (searchParams?.has("worldId",)) {
      content = content.replace("{{worldId}}", () => searchParams.get("worldId",)!,);
    }
    return content;
  }

  // Fallback to components dir
  const componentPath = join(COMPONENTS_DIR, `${name}.html`,);
  if (existsSync(componentPath,)) {
    return readFileSync(componentPath, "utf8",);
  }

  return null;
}

export { serveStaticPartial, };

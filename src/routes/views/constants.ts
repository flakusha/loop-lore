import { existsSync, readdirSync, } from "node:fs";
import { join, } from "node:path";

const VIEWS_DIR = join(import.meta.dir, "..", "..", "views",);
const PARTIALS_DIR = join(import.meta.dir, "..", "..", "partials",);
const COMPONENTS_DIR = join(import.meta.dir, "..", "..", "components",);
const ICONS_DIR = join(import.meta.dir, "..", "..", "..", "dist", "public", "icons", "tabler",);

/** Match {{{ t("key") }}} or {{{t("key")}}} with optional whitespace. */
const I18N_TEMPLATE_RE = /\{\{\{\s*t\("([^"]+)"\)\s*\}\}\}/g;

/**
 * Auto-discover allowed views from src/views/ directory.
 * Any .html file (except layout.html) becomes a valid view name.
 */
function discoverViews(dir: string,): Set<string> {
  const views = new Set<string>();
  if (!existsSync(dir,)) { return views; }
  for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
    if (entry.isFile() && entry.name.endsWith(".html",) && entry.name !== "layout.html") {
      views.add(entry.name.replace(/\.html$/, "",),);
    }
  }
  // Alias: "assets" serves the "gallery" view
  views.add("assets",);
  return views;
}

/**
 * Auto-discover allowed partials from src/partials/ directory.
 * Supports nested directories (e.g. characters/create-modal).
 */
function discoverPartials(dir: string,): Set<string> {
  const partials = new Set<string>();
  if (!existsSync(dir,)) { return partials; }
  function walk(current: string, prefix: string,): void {
    for (const entry of readdirSync(current, { withFileTypes: true, },)) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(current, entry.name,), rel,);
      } else if (entry.name.endsWith(".html",)) {
        partials.add(rel.replace(/\.html$/, "",),);
      }
    }
  }
  walk(dir, "",);
  return partials;
}

const ALLOWED_VIEWS = discoverViews(VIEWS_DIR,);
// Partials may live in src/partials/ or src/components/ (serveStaticPartial
// falls back to the components dir), so discovery spans both roots.
const ALLOWED_PARTIALS = new Set<string>([
  ...discoverPartials(PARTIALS_DIR,),
  ...discoverPartials(COMPONENTS_DIR,),
],);

export {
  ALLOWED_PARTIALS,
  ALLOWED_VIEWS,
  COMPONENTS_DIR,
  I18N_TEMPLATE_RE,
  ICONS_DIR,
  PARTIALS_DIR,
  VIEWS_DIR,
};

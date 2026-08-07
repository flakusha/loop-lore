import { existsSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import { getRawTranslations, } from "../../i18n/locale-loader";
import type { Locale, } from "../../i18n/types";
import { getNonce, } from "../../middleware/csp-nonce";
import { detectLocale, } from "../../middleware/i18n";
import { isFrontendTelemetryEnabled, } from "../../telemetry/service";
import { jsonStringifyOr, } from "../../utils";
import { COMPONENTS_DIR, I18N_TEMPLATE_RE, ICONS_DIR, VIEWS_DIR, } from "./constants";

const viewCache = new Map<string, string>();

function wrapWithLayout(
  content: string,
  title?: string,
  userId?: string | null,
  sessionId?: string | null,
  cspNonce?: string | null,
  t?: (key: string,) => string,
  locale?: string,
): string {
  const layoutPath = join(VIEWS_DIR, "layout.html",);
  if (!existsSync(layoutPath,)) { return content; }

  let layout = readFileSync(layoutPath, "utf8",);
  layout = layout.replace("{{{content}}}", () => content,);
  layout = layout.replace("{{telemetryEnabled}}", () => (isFrontendTelemetryEnabled() ? "true" : "false"),);
  layout = layout.replace("{{userId}}", () => jsonStringifyOr(userId ?? null, "null",),);
  layout = layout.replace("{{sessionId}}", () => jsonStringifyOr(sessionId ?? null, "null",),);
  layout = layout.replaceAll("{{cspNonce}}", () => cspNonce ?? "",);
  if (title) { layout = layout.replace(/<title>.*?<\/title>/, () => `<title>${title} — Loop Lore</title>`,); }
  // i18n: replace {{{t("key")}}} with translated string
  layout = applyI18n(layout, t,);
  // Inject locale strings synchronously so Alpine t() calls resolve before fetch completes
  if (locale) {
    const rawTranslations = getRawTranslations(locale as Locale,);
    if (rawTranslations) {
      const nonceAttr = cspNonce ? ` nonce="${cspNonce}"` : "";
      const jsonData = jsonStringifyOr(rawTranslations, "{}",);
      const injectScript =
        `<script type="application/json" id="locale-data"${nonceAttr}>${jsonData}</script><script${nonceAttr}>try{globalThis.__localeStrings = JSON.parse(document.getElementById("locale-data").textContent);}catch{}</script>`;
      layout = layout.replace(
        "<!-- Initialize locale from cookie/localStorage before page renders -->",
        () => `${injectScript}\n    <!-- Initialize locale from cookie/localStorage before page renders -->`,
      );
    }
  }
  return layout;
}

function resolveIncludes(content: string, chain = new Set<string>(),): string {
  return content.replaceAll(/\{\{>\s*([\w./-]+)\s*\}\}/g, (_match, includePath: string,) => {
    const resolved = join(COMPONENTS_DIR, includePath,);
    if (chain.has(resolved,)) {
      throw new Error(`Circular include detected: ${includePath} (resolved to ${resolved})`,);
    }
    if (!existsSync(resolved,)) {
      throw new Error(`Include not found: ${includePath} (resolved to ${resolved})`,);
    }
    const included = readFileSync(resolved, "utf8",);
    chain.add(resolved,);
    return resolveIncludes(included, chain,);
  },);
}

/**
 * Replace `{{icon:name}}` directives with inline SVG content from
 * `dist/public/icons/tabler/{name}.svg`. The dist SVGs are copied from
 * node_modules by `src/build/copy-icons.ts` during the frontend build.
 *
 * Falls back to a comment placeholder if the icon file is missing so
 * the page still renders (visible indicator for debugging).
 */
function resolveIcons(content: string,): string {
  return content.replaceAll(/\{\{icon:([\w-]+)\}\}/g, (_match, name: string,) => {
    const iconPath = join(ICONS_DIR, `${name}.svg`,);
    if (!existsSync(iconPath,)) {
      return `<!-- icon not found: ${name} -->`;
    }
    return readFileSync(iconPath, "utf8",);
  },);
}

function loadView(viewName: string,): string {
  const cached = viewCache.get(viewName,);
  if (cached !== undefined) { return cached; }

  const viewPath = join(VIEWS_DIR, `${viewName}.html`,);
  if (!existsSync(viewPath,)) { return ""; }
  const content = readFileSync(viewPath, "utf8",);
  const resolved = resolveIcons(resolveIncludes(content,),);
  viewCache.set(viewName, resolved,);
  return resolved;
}

export function applyI18n(content: string, t?: (key: string,) => string,): string {
  if (!t) { return content; }
  return content.replaceAll(I18N_TEMPLATE_RE, (_match, key,) => t(key,),);
}

function respond(
  content: string,
  isHtmx: boolean,
  title?: string,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response {
  const nonce = request ? getNonce(request,) : null;
  const locale = request ? detectLocale(request,) : undefined;
  const body = isHtmx ? applyI18n(content, t,) : wrapWithLayout(content, title, userId, sessionId, nonce, t, locale,);
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", },
  },);
}

function notFoundView(
  message: string,
  isHtmx: boolean,
  title = "Not found",
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response {
  const translatedTitle = t ? t("errors.notFound",) : title;
  const content = `<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">${escapeHtml(message,)}</div>
    </div>`;
  return respond(content, isHtmx, translatedTitle, userId, sessionId, request, t,);
}

function htmlResponse(body: string,): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", },
  },);
}

function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

export { escapeHtml, htmlResponse, loadView, notFoundView, respond, };

/**
 * Template Regex Patterns
 *
 * Patterns for HTML template rendering: title replacement, component includes,
 * icon directives, and i18n interpolation.
 *
 * Source: src/routes/views.ts
 */

/** Match <title>...</title> for replacement */
export const TITLE_TAG = /<title>.*?<\/title>/;

/** Match component include directives: {{> path/to/component}} */
export const INCLUDE_DIRECTIVE = /\{\{>\s*([\w./-]+)\s*\}\}/g;

/** Match icon directives: {{icon:icon-name}} */
export const ICON_DIRECTIVE = /\{\{icon:([\w-]+)\}\}/g;

/** Match i18n translation directives: {{{t("key")}}} */
export const I18N_DIRECTIVE = /\{\{\{t\("([^"]+)"\)\}\}\}/g;

/** Match HTML file extensions for view resolution */
export const HTML_EXTENSION = /\.html?$/i;

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import CleanCSS from "clean-css";
import { minify as minifyHTML, } from "html-minifier-terser";
import { minify as terserMinify, } from "terser";

/**
 * Production HTML options — shared by the build, runtime responses and the
 * minify-parity gate. NEVER enable (or lean on) these:
 * - removeAttributeQuotes: corrupts Alpine `x-*` / `:*` / `@*` bindings —
 *   `x-data="app()" :href="'/w/' + id"` becomes `x-data=app() ... @click=go()`.
 * - removeEmptyElements: deletes live empty htmx OOB targets `#header-slot`
 *   and `#toast-container` (src/views/layout.html).
 * - collapseInlineTagWhitespace: drops meaningful inline spacing
 *   (`<span>a</span> <span>b</span>` -> no space); prefer conservativeCollapse.
 *   It is on today for legacy byte savings — do not extend its use.
 */
export const defaultHTMLOptions = {
  collapseWhitespace: true,
  collapseInlineTagWhitespace: true,
  caseSensitive: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true,
  minifyCSS: true,
  minifyJS: true,
};

const cssMinifier = new CleanCSS({ level: 2, },);

/**
 * @param content
 * @returns string
 */
export function minifyText(content: string,): string {
  const lines = content.split("\n",);
  const result: string[] = [];
  let isPreviousBlank = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed === "") {
      if (!isPreviousBlank) {
        result.push("",);
        isPreviousBlank = true;
      }
    } else {
      result.push(trimmed,);
      isPreviousBlank = false;
    }
  }

  return result.join("\n",);
}

/**
 * @param content
 * @returns void
 */
export async function minifyHTMLContent(content: string,): Promise<string> {
  return minifyHTML(content, defaultHTMLOptions,);
}

/**
 * @param content
 * @returns void
 * @throws {Error}
 */
export function minifyCSS(content: string,): string {
  const output = cssMinifier.minify(content,);
  if (output.errors.length > 0) {
    throw new Error(`CSS minification error: ${output.errors.join(", ",)}`,);
  }

  return output.styles;
}

/**
 * @param content
 * @throws {Error}
 * @returns {Promise<string>}
 */
export async function minifyJS(content: string,): Promise<string> {
  try {
    const result = await terserMinify(content, { module: true, compress: true, mangle: true, },);
    return result.code ?? content;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error,),);
  }
}

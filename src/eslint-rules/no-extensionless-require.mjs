// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Node module prefixes that are never ambiguous: they address a package, not a
 * path on disk, so they bypass the extension check entirely.
 */
const NODE_BUILTIN_PREFIXES = ["node:", "bun:",];

/**
 * Package specifiers the repo requires by bare name in tests. These are real
 * installed packages whose entrypoint is resolved through `node_modules`, so a
 * missing extension is not a directory-resolution hazard.
 */
const KNOWN_PACKAGE_SPECIFIERS = [
  "fs",
  "path",
  "os",
  "crypto",
  "util",
  "url",
  "events",
  "stream",
  "http",
  "https",
  "zlib",
  "child_process",
  "assert",
  "buffer",
  "querystring",
  "perf_hooks",
];

/**
 * Extensions that pin a require() to one exact file on disk. Anything with one
 * of these tails can never be re-interpreted as a directory specifier, so the
 * JSON-loader fallback is unreachable.
 *
 * @type {Set<string>}
 */
const EXPLICIT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".node",],);

/**
 * True when the argument is a `node:`/`bun:` builtin or a known bare package.
 * These are the safe half of the rule; only relative paths need an extension.
 * @param {string} specifier
 * @returns {boolean}
 */
function isBuiltinOrPackage(specifier,) {
  if (NODE_BUILTIN_PREFIXES.some((prefix,) => specifier.startsWith(prefix,))) { return true; }
  if (specifier.includes("/",) || specifier.includes("\\",)) { return false; }
  return KNOWN_PACKAGE_SPECIFIERS.includes(specifier,);
}

/**
 * ESLint rule: `require()` in a test file must name an explicit file extension.
 *
 * A bare relative specifier like `require("./chat-export")` is ambiguous: when
 * it resolves to a DIRECTORY, Bun's CJS resolver can fall through to its JSON
 * loader and hand the resolved absolute path -- a string beginning with `/` --
 * to the JSON parser. That surfaces as the suite-wide
 * `SyntaxError: JSON Parse error: Unrecognized token '/'` signature.
 *
 * Scoped to test files on purpose. Production modules legitimately use
 * `require("htmx.org/dist/ext/alpine-morph.js")`-style specifiers, and a
 * `require` that merely shadows the global as a function parameter is not a
 * module load at all.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
export const noExtensionlessRequireRule = {
  meta: {
    type: "problem",
    docs: {
      description: "require() in a test file must use an explicit file extension",
    },
    schema: [],
    messages: {
      extensionlessRequire:
        'require("{{specifier}}") has no file extension. If it resolves to a directory, Bun\'s JSON loader parses the resolved path and throws `JSON Parse error: Unrecognized token \'/\'`. Use a static import, or require the explicit entrypoint (e.g. "{{specifier}}/index.ts").',
    },
  },
  create(context,) {
    const filename = context.filename ?? context.getFilename();
    const isTestFile = /\.[cm]?[jt]sx?$/.test(filename,) &&
      /(^|[/\\])[^/\\]*(\.(test|spec))\.[cm]?[jt]sx?$/.test(filename,);
    if (!isTestFile) { return {}; }

    return {
      /**
       * @param {import("eslint").Rule.Node} node
       */
      CallExpression(node,) {
        const call =
          /** @type {{ callee?: { type?: string; name?: string }; arguments?: { type?: string; value?: unknown }[] }} */ (node);
        // `foo.require(...)` is not the CommonJS global; ignore it.
        if (call.callee?.type !== "Identifier" || call.callee.name !== "require") { return; }
        const first = call.arguments?.[0];
        // Only a plain string literal can be judged statically. A computed or
        // dynamic specifier has no extension to check here.
        if (first?.type !== "Literal" || typeof first.value !== "string") { return; }
        const specifier = first.value;
        if (!specifier.startsWith(".",)) { return; }
        if (isBuiltinOrPackage(specifier,)) { return; }
        const tail = specifier.split(/[/\\]/,).pop() ?? "";
        const dot = tail.lastIndexOf(".",);
        // No dot at all in the final segment: this is the ambiguous form.
        if (dot === -1) {
          context.report({ node, messageId: "extensionlessRequire", data: { specifier, }, },);
          return;
        }
        if (!EXPLICIT_EXTENSIONS.has(tail.slice(dot,).toLowerCase(),)) {
          context.report({ node, messageId: "extensionlessRequire", data: { specifier, }, },);
        }
      },
    };
  },
};

export default noExtensionlessRequireRule;

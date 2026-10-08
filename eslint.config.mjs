// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ESLint flat config -- TypeScript + Unicorn + SonarJS + JSDoc
// https://eslint.org/docs/latest/use/configure/configuration-files
// https://typescript-eslint.io/getting-started/typed-linting
//
// NOTE: ESLint is kept minimal. oxlint handles most rules.
// ESLint kept ONLY for:
//   - import/* (cycle detection, ordering, mutable exports)
//   - Custom AST selectors: JSON.parse/stringify, Promise.all
//   - jsdoc/* (JSDoc tag validation + public-export coverage)

import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import markdown from "eslint-plugin-markdown";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";
import { optionsObjectParamsRule } from "./src/eslint-rules/options-object-params.mjs";

const projectRoot = import.meta.dirname;

// Custom AST selectors that ONLY ESLint supports (oxlint can't replicate these)
const customRestrictedSyntax = [
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
    message: "Use safeJsonParse<T>() or jsonParseOr() from utils instead of bare JSON.parse",
  },
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
    message: "Use safeJsonStringify() from utils instead of bare JSON.stringify",
  },
  {
    selector: "CallExpression[callee.object.name='Promise'][callee.property.name='all']",
    message: "Promise.all() can cause unhandled rejections. Use Promise.allSettled() or sequential await.",
  },
  {
    selector: "CallExpression[callee.name='fetch']",
    message: "Use safeFetch()/safeFetchWithRetry() from utils/safe-fetch instead of bare fetch",
  },
  {
    selector: "CallExpression[callee.name='btoa']",
    message: "Use toBase64() from utils/base64 (or safeToBase64 from utils/safe-buffer) instead of btoa",
  },
  {
    selector: "CallExpression[callee.name='atob']",
    message: "Use fromBase64() from utils/base64 (or safeFromBase64 from utils/safe-buffer) instead of atob",
  },
  {
    selector: "CallExpression[callee.name='parseInt']",
    message: "Use safeParseInt()/parseIntOr() from utils/parse-number instead of bare parseInt",
  },
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: "Use safeParseFloat()/parseFloatOr() from utils/parse-number instead of bare parseFloat",
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
    message: "Use parseExpiryMs() or toDate() from utils/date instead of bare Date.parse",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length>0]",
    message: "Use toDate() from utils/date instead of bare new Date(var). new Date() (now) and new Date(epochMs) arithmetic are allowed.",
  },
  {
    // safeFromUint8Array performs NO decoding, so wrapping a
    // `Buffer.from(<string>)` launders an unvalidated string-to-bytes coercion
    // through a size guard that cannot catch it. Encode with
    // safeFromString / mustFromString instead.
    selector:
      "CallExpression:matches([callee.name='safeFromUint8Array'], [callee.name='mustFromUint8Array'])[arguments.0.type='CallExpression'][arguments.0.callee.object.name='Buffer'][arguments.0.callee.property.name='from'][arguments.0.arguments.0.type='Literal']",
    message:
      "safeFromUint8Array() does not decode. Buffer.from(<string literal>) must be encoded with safeFromString()/mustFromString() so the coercion is validated.",
  },
];

// Local rule: options-object parameters convention
// (.agents/references/recommendations.md -- Code Structure section).
// Implementation + unit tests: src/eslint-rules/options-object-params.mjs.
const localPlugin = {
  rules: {
    "options-object-params": optionsObjectParamsRule,
  },
};

// Shared plugins
const tsPlugins = {
  "@typescript-eslint": tseslint.plugin,
  // v77 dropped the `flat/` prefix; `configs.recommended` IS the flat config.
  unicorn: unicorn.configs.recommended.plugins.unicorn,
  sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
  import: importPlugin,
  // Local (inline) plugin -- no new dependency; defined above.
  local: localPlugin,
};

// Minimal rules -- oxlint handles most; ESLint only for what oxlint can't do
const tsRules = {
  "no-restricted-syntax": ["error", ...customRestrictedSyntax],
  "import/no-cycle": ["error", { maxDepth: 1 }],
  "import/first": "error",
  "import/no-mutable-exports": "error",
  "import/no-duplicates": "error",
  "import/no-self-import": "error",
  "no-empty": "error",
  "@typescript-eslint/no-empty-function": "error",
  "no-unused-vars": "off",
  "no-undef": "off",
  "no-redeclare": "off",
  "sort-keys": "off",
  // Allow `== null` (nullish check) but forbid all other loose equality.
  "eqeqeq": ["error", "smart"],
  // Paragraph navigation: blank line after every multiline statement, so dense
  // declaration blocks (objects, calls, literals) read as separated paragraphs.
  // Autofixable; oxlint has no equivalent (ESLint-only). Blank lines are exempt
  // from the size gate, so padding never tips the 250L budget.
  "padding-line-between-statements": ["error",
    { "blankLine": "always", "prev": "multiline-block-like", "next": "*" },
    { "blankLine": "always", "prev": "multiline-expression", "next": "*" },
    { "blankLine": "always", "prev": "multiline-const", "next": "*" },
    { "blankLine": "always", "prev": "multiline-let", "next": "*" },
  ],
};

// Stub rules for rules referenced in eslint-disable comments in scripts.
// These rules exist in older unicorn/sonarjs configs but not in current plugins.
const stubRuleDefs = {
  meta: { schema: false },
  create() {
    return {};
  },
};

export default [
  {
    ignores: [
      "dist/",
      "node_modules/",
      "data/",
      "**/.tmp/",
      ".hermes/",
      "docs/.vitepress/",
      "docs/research/",
      "migrations/",
      "plugins/",
      "tree/",
      "bun.lock",
      "*.har",
      "*.example.*",
      ".agents/**/*.md",
      // eslint-plugin-markdown's virtual code-block files (`README.md/0_0.ts`)
      // are not tsconfig members, so the typed parser rejects them.
      "src/**/*.md/**",
    ],
  },
  ...markdown.configs.recommended,
  {
    files: ["**/*.md"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-unused-expressions": "off",
      "padded-blocks": "off",
      "eol-last": "off",
      "unicorn/filename-case": "off",
    },
  },
  // Server TypeScript -- most rules disabled (oxlint handles them)
  {
    files: ["src/**/*.ts", "src/**/*.js"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "tsconfig.json",
        tsconfigRootDir: projectRoot,
      },
      globals: {
        ...globals.bun,
        ...globals.node,
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
      },
    },
    plugins: tsPlugins,
    rules: {
      ...tsRules,
      // Local convention rule (see .agents/references/recommendations.md).
      "local/options-object-params": "warn",
      "unicorn/prefer-node-protocol": "off",
      "unicorn/no-process-exit": "off",
      "unicorn/no-uint8array-base64": "off",
      "unicorn/no-this-outside-of-class": "off",
      "unicorn/no-global-object-property-assignment": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-unnecessary-template-expression": "off",
      "no-restricted-globals": "off",
      // Structured logging is the only log entry point (epic-logging). A server-side
      // `console.*` bypasses the async queue, the censors and the transports, so the
      // line never reaches `log_entries` or the JSONL file. Scripts and the frontend
      // carry an explicit exemption below — both write human-facing output with no
      // request context to bind a child logger to.
      "no-console": "error",
    },
  },
  // `src/scripts/**` are standalone CLI entry points whose stdout IS the product —
  // gate scripts whose output the parallel check runner parses. Delete this block
  // once each one has a module-scoped `getLogger()` with a meaningful module name.
  {
    files: ["src/scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // JSDoc — kept at `warn` (best-effort). Lifted to `error` only when coverage is high
  // enough that the gate stays green (TASK-jsdoc-coverage-cleanup-public-exports tracks
  // progress; per-function violations surface as warnings until the project is ready).
  {
    files: ["src/**/*.ts"],
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/require-param": "warn",
      "jsdoc/require-returns": "warn",
      "jsdoc/require-throws": "warn",
      // Descriptions and example are optional — keep JSDoc terse to avoid
      // inflating files past the 200-line ceiling.
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-example": "off",
      "jsdoc/require-yields": "off",
      "jsdoc/require-throws-type": "off",
      "jsdoc/check-param-names": "off",
    },
  },
  // E2E tests
  {
    files: ["tests/e2e/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.bun,
      },
    },
    plugins: tsPlugins,
    rules: {
      ...tsRules,
      "unicorn/no-this-outside-of-class": "off",
      "sonarjs/no-identical-functions": "off",
      "sonarjs/no-nested-switch": "off",
      "no-empty": "off",
      "@typescript-eslint/no-empty-function": "off",
      "no-restricted-syntax": "off",
      "local/options-object-params": "off",
    },
  },
  // Frontend TypeScript -- most rules disabled
  {
    files: ["src/frontend/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "tsconfig.frontend.json",
        tsconfigRootDir: projectRoot,
      },
      globals: {
        ...globals.browser,
        apiFetch: "readonly",
        THEMES: "readonly",
        showToast: "readonly",
        closeSidebar: "readonly",
        toggleSidebar: "readonly",
        applyTheme: "readonly",
        setLocale: "readonly",
        __: "readonly",
        __THEMES: "readonly",
        __localeStrings: "readonly",
        Alpine: "readonly",
        htmx: "readonly",
        require: "readonly",
        chatState: "readonly",
        worldEditState: "readonly",
      },
    },
    plugins: tsPlugins,
    rules: {
      ...tsRules,
      "unicorn/prefer-node-protocol": "off",
      "unicorn/no-process-exit": "off",
      "unicorn/no-uint8array-base64": "off",
      "unicorn/no-this-outside-of-class": "off",
      "unicorn/no-global-object-property-assignment": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-unnecessary-template-expression": "off",
      "no-restricted-globals": "off",
      // Banned-pattern enforcement on frontend is owned by ESLint (not a separate
      // script). Warn-level so `check` stays green while surfacing debt; promote
      // to "error" after the existing occurrences are cleaned up.
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  // Test files: disable all restrictions + JSDoc
  {
    files: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    rules: {
      // Tests print diagnostic output to the runner's stdout on purpose; there is
      // no server process and no structured-log contract to route it through.
      "no-console": "off",
      "no-restricted-syntax": "off",
      "no-empty": "off",
      "@typescript-eslint/no-empty-function": "off",
      "local/options-object-params": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-throws": "off",
    },
  },
  // Generated artifacts (db:sync-* / db:sync-manifest) — never hand-edit
  {
    files: [
      "src/db/schema*.ts",
      "src/db/schema.ts",
      "src/db/schema-manifest.ts",
      "src/validation/db-schemas.ts",
      "src/test-utils/insert-helpers.ts",
    ],
    rules: {
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-throws": "off",
      // Generated verbatim by `bun run db:sync-*`; autofix output would be
      // undone by the next generator run, so padding is exempt here.
      "padding-line-between-statements": "off",
      // insert-helpers.ts is 169 of the rule's 1247 findings (13.6%) and is
      // emitted verbatim by `bun run db:sync-types`; rewriting its signatures
      // would be undone by the next generator run.
      "local/options-object-params": "off",
    },
  },
  // Util implementations: base64 wraps btoa/atob; safe-fetch wraps bare fetch;
  // url-validation parses ports; date.ts wraps Date.parse / new Date.
  {
    files: [
      "src/utils/safe-json.ts",
      "src/frontend/alpine/json.ts",
      "src/utils/base64.ts",
      "src/utils/safe-fetch/fetch.ts",
      "src/utils/url-validation.ts",
      "src/utils/date.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
      "no-restricted-globals": "off",
    },
  },
  // Deliberate bare fetch: these layers need the raw Response (SSE/retry
  // stream handling, error-body introspection, arrayBuffer downloads) which
  // safeFetch's Result union cannot express.
  {
    files: [
      "src/generation/providers/anthropic/http.ts",
      "src/generation/providers/ollama-native/http.ts",
      "src/generation/providers/openai-compatible/http.ts",
      "src/generation/lora/discovery-http.ts",
      "src/generation/matting/providers.ts",
      "src/generation/providers/comfyui.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Specific source files with JSON.parse/stringify or fetch
  {
    files: [
      "src/chat/music-links.ts",
      "src/utils.ts",
      "src/scripts/version-bump.ts",
      "src/routes/character-growth/index.ts",
      "src/frontend/alpine/i18n.test-helper.ts",
      "src/frontend/character-growth-editor.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
      "no-restricted-globals": "off",
    },
  },
  // Legitimate new Date(epochMs) — safe epoch math, not untrusted string input.
  // These compute timestamps from Date.now() ± offsets, not from DB/user strings.
  {
    files: [
      "src/chat/moderation.ts",
      "src/chat/proactive/timing.ts",
      "src/chat/proactive/index.ts",
      "src/chat/proactive/annotations.ts",
      "src/async/offload-pass.ts",
      "src/telemetry/cleanup.ts",
      "src/memory/purge.ts",
      "src/middleware/auth/authenticate.ts",
      "src/routes/admin/aux-telemetry.ts",
      "src/routes/telemetry-purge.ts",
      "src/routes/auth/session.ts",
      "src/routes/messages/archiving.ts",
      "src/federation/sharing.ts",
      "src/crypto/key-rotation/find-expired.ts",
      "src/services/trade/counter.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // TUI app: process.exit allowed
  {
    files: ["src/tui/app.ts"],
    rules: {
      "unicorn/no-process-exit": "off",
    },
  },
  // Scripts (JS modules): provide stub rule definitions so eslint-disable comments
  // referencing non-existent rules (unicorn/name-replacements, etc.) don't cause
  // "Definition for rule not found" errors. Stub rules are no-ops.
  {
    files: ["scripts/**/*.mjs", "scripts/worktree/**/*.mjs"],
    plugins: {
      unicorn: {
        rules: {
          "name-replacements": stubRuleDefs,
          "consistent-boolean-name": stubRuleDefs,
          "prefer-string-replace-all": stubRuleDefs,
          "prefer-switch": stubRuleDefs,
          "no-lonely-if": stubRuleDefs,
          "import-style": stubRuleDefs,
        },
      },
      sonarjs: {
        rules: {
          "no-os-command-from-path": stubRuleDefs,
        },
      },
    },
    rules: {
      "unicorn/name-replacements": "off",
      "unicorn/consistent-boolean-name": "off",
      "unicorn/prefer-string-replace-all": "off",
      "unicorn/prefer-switch": "off",
      "unicorn/no-lonely-if": "off",
      "unicorn/import-style": "off",
      "sonarjs/no-os-command-from-path": "off",
    },
  },
];

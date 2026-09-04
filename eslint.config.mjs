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
];

// Shared plugins
const tsPlugins = {
  "@typescript-eslint": tseslint.plugin,
  unicorn: unicorn.configs["flat/recommended"].plugins.unicorn,
  sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
  import: importPlugin,
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
    },
  },
  // JSDoc -- recommendation-level (warn, non-blocking). Ongoing cleanup task:
  // promote to "error" after existing public-export debt is cleared.
  {
    files: ["src/**/*.ts"],
    plugins: {
      jsdoc,
    },
    rules: {
      // ...jsdoc.configs["flat/recommended-typescript"].rules,
      // Relaxed rules — require-jsdoc presence but not full descriptions
      // (can revisit once public-export debt is cleared)
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-throws": "off",
      "jsdoc/require-example": "off",
      "jsdoc/require-yields": "off",
      "jsdoc/require-throws-type": "off",
      "jsdoc/check-param-names": "off",
      // Target public exports only (not private/internal helpers)
      "jsdoc/require-jsdoc": ["warn", {
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          MethodDefinition: true,
        },
        contexts: [
          "ExportNamedDeclaration > FunctionDeclaration",
          "ExportNamedDeclaration > ClassDeclaration",
          "ExportNamedDeclaration > TSTypeAliasDeclaration",
          "ExportNamedDeclaration > TSInterfaceDeclaration",
          "ExportNamedDeclaration > VariableDeclaration > ArrowFunctionExpression",
        ],
      }],
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
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "warn",
    },
  },
  // Test files: disable all restrictions
  {
    files: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "no-empty": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  // Util implementations: base64 wraps btoa/atob; safe-fetch wraps bare fetch;
  // url-validation parses ports.
  {
    files: [
      "src/utils/safe-json.ts",
      "src/frontend/alpine/json.ts",
      "src/utils/base64.ts",
      "src/utils/safe-fetch/fetch.ts",
      "src/utils/url-validation.ts",
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
      "src/frontend/alpine/i18n.test-helper.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
      "no-restricted-globals": "off",
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

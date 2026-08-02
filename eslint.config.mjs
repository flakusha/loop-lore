// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ESLint flat config — TypeScript + Unicorn + SonarJS
// https://eslint.org/docs/latest/use/configure/configuration-files
// https://typescript-eslint.io/getting-started/typed-linting

import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import markdown from "eslint-plugin-markdown";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

const projectRoot = import.meta.dirname;

// ── Custom no-restricted-syntax rules ──────────────────────
// Extracted from tsRules for readability — shared across server + frontend.
const customRestrictedSyntax = [
  // JSON safety
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
    message: "Use safeJsonParse<T>() or jsonParseOr() from utils instead of bare JSON.parse",
  },
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
    message: "Use safeJsonStringify() from utils instead of bare JSON.stringify",
  },
  // Array iteration: prefer for-of over array-allocating methods (.map/.filter/.reduce)
  // Enforces in-place modifications to avoid shadow allocations.
  // Non-allocating early-return predicates (.find/.findIndex/.some/.every) are allowed.
  // https://eslint.org/docs/latest/rules/no-restricted-syntax
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='map']",
    message: "Avoid .map() — use for-of with push() for in-place transformation. Shadow allocation not needed here.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='filter']",
    message: "Avoid .filter() — use for-of with push() for in-place filtering. Shadow allocation not needed here.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='reduce']",
    message: "Avoid .reduce() — use a for-of loop with an accumulator variable. Clearer control flow.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='flatMap']",
    message: "Avoid .flatMap() — use for-of with push() for in-place flattening.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='flat']",
    message: "Avoid .flat() — use for-of with push() to flatten in-place. Shadow allocation not needed here.",
  },
  // Promise.all — prefer Promise.allSettled for partial-failure resilience
  {
    selector: "CallExpression[callee.object.name='Promise'][callee.property.name='all']",
    message: "Prefer Promise.allSettled() over Promise.all() — handle partial failures instead of complete abort.",
  },
  // Naked Buffer: ban deprecated/unsafe patterns
  // Bun alternatives: Bun.file().text()/.arrayBuffer(), Buffer.from(data, encoding)
  {
    selector: "NewExpression[callee.name='Buffer']",
    message: "new Buffer() is deprecated. Use Buffer.from() or Bun.file() instead.",
  },
  {
    selector: "MemberExpression[object.name='Buffer'][property.name='allocUnsafe']",
    message: "Buffer.allocUnsafe() exposes uninitialized memory. Use Buffer.alloc() or Bun.file() instead.",
  },
  {
    selector: "MemberExpression[object.name='Buffer'][property.name='allocUnsafeSlow']",
    message: "Buffer.allocUnsafeSlow() exposes uninitialized memory. Use Buffer.alloc() or Bun.file() instead.",
  },
  {
    selector: "MemberExpression[object.name='Buffer'][property.name='isBuffer']",
    message: "Buffer.isBuffer() is unnecessary. Use instanceof Uint8Array or Bun.Buffer instead.",
  },
  {
    selector: "MemberExpression[object.name='Buffer'][property.name='poolSize']",
    message: "Buffer.poolSize is a deprecated internal. Remove this reference.",
  },
];

// Shared rules for all TS source files (server + frontend)
const tsPlugins = {
  "@typescript-eslint": tseslint.plugin,
  unicorn: unicorn.configs["flat/recommended"].plugins.unicorn,
  sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
  import: importPlugin,
};

const tsRules = {
  // ── Unicorn shared overrides ───────────────────────────────
  ...unicorn.configs["flat/recommended"].rules,
  "unicorn/prefer-module": "off",
  "unicorn/prevent-abbreviations": "off",
  "unicorn/no-null": "off",
  "unicorn/no-array-reduce": "off",
  "unicorn/prefer-at": "off",
  "unicorn/name-replacements": "off",
  "unicorn/consistent-boolean-name": "off",
  "unicorn/filename-case": [
    "warn",
    { cases: { kebabCase: true, pascalCase: true, snakeCase: true, }, multipleFileExtensions: false, },
  ],
  "unicorn/consistent-function-scoping": "warn",
  "unicorn/custom-error-definition": "off",
  "unicorn/throw-new-error": "error",
  "unicorn/no-await-expression-member": "error",
  "unicorn/switch-case-braces": ["error", "always",],
  "unicorn/no-unnecessary-await": "error",
  "unicorn/expiring-todo-comments": "warn",
  "unicorn/prefer-top-level-await": "error",
  "unicorn/catch-error-name": ["error", { name: "error", },],
  "unicorn/prefer-optional-catch-binding": "error",
  "unicorn/import-style": "off",
  "unicorn/no-top-level-side-effects": "off",
  "unicorn/consistent-class-member-order": "off",
  "unicorn/no-array-sort": "off",
  "unicorn/no-array-reverse": "off",
  "unicorn/prefer-iterator-to-array": "off",
  "unicorn/no-break-in-nested-loop": "off",
  "unicorn/no-immediate-mutation": "off",
  "unicorn/isolated-functions": "off",
  "unicorn/no-incorrect-query-selector": "off",
  "unicorn/prefer-spread": "off",
  "unicorn/prefer-string-raw": "off",

  // ── SonarJS shared overrides ───────────────────────────────
  ...sonarjs.configs.recommended.rules,
  "sonarjs/no-duplicate-string": "off",
  "sonarjs/todo-tag": "off",
  "sonarjs/function-return-type": "off",
  "sonarjs/argument-type": "off",
  "sonarjs/no-empty-function": "off",
  "sonarjs/unused-import": "off",
  "sonarjs/no-unused-vars": "off",
  "sonarjs/deprecation": "off",
  "sonarjs/regex-complexity": "off",
  "sonarjs/no-ignored-return": "warn",
  "sonarjs/no-identical-conditions": "error",
  "sonarjs/no-identical-functions": "off",
  "sonarjs/no-inverted-boolean-check": "error",
  "sonarjs/no-empty-collection": "error",
  "sonarjs/prefer-single-boolean-return": "warn",
  "sonarjs/prefer-immediate-return": "warn",
  "sonarjs/no-nested-conditional": "off",
  "sonarjs/assertions-in-tests": "off",
  "sonarjs/no-dead-store": "off",
  "sonarjs/no-misleading-array-reverse": "off",
  "sonarjs/pseudo-random": "off",
  "sonarjs/no-undefined-argument": "off",
  "sonarjs/no-alphabetical-sort": "off",
  "sonarjs/no-all-duplicated-branches": "off",
  "sonarjs/fixme-tag": "off",
  "sonarjs/duplicates-in-character-class": "off",
  "sonarjs/different-types-comparison": "off",
  "sonarjs/no-os-command-from-path": "off",
  "sonarjs/super-linear-regex": "off",
  "sonarjs/prefer-regexp-exec": "off",
  "sonarjs/publicly-writable-directories": "off",
  "preserve-caught-error": "off",

  // ── TypeScript shared overrides ────────────────────────────
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", },],
  "@typescript-eslint/non-nullable-type-assertion-style": "off",
  "@typescript-eslint/no-confusing-void-expression": "off",
  "@typescript-eslint/await-thenable": "off",
  "@typescript-eslint/no-non-null-assertion": "off",
  "@typescript-eslint/prefer-nullish-coalescing": "off",
  "@typescript-eslint/no-unnecessary-condition": "off",
  "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
  "@typescript-eslint/consistent-type-definitions": ["error", "interface",],
  "@typescript-eslint/no-misused-promises": "error",

  // ── Complexity ceiling ─────────────────────────────────────
  "sonarjs/cognitive-complexity": ["warn", 20,],

  // ── Import hygiene ─────────────────────────────────────────
  "import/no-cycle": ["error", { maxDepth: 1, },],
  "import/first": "error",
  "import/no-mutable-exports": "error",

  // ── Custom restricted syntax ────────────────────────────────
  "no-restricted-syntax": ["warn", ...customRestrictedSyntax,],
  // ── Low-value rules generating noise from Elysia/Kysely patterns ──
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "@typescript-eslint/no-unsafe-return": "off",
  "@typescript-eslint/no-explicit-any": "off",

  // ── Low-value unicorn style rules ────────────────────────────
  "unicorn/no-declarations-before-early-exit": "off",
  "unicorn/no-top-level-assignment-in-function": "off",
  "unicorn/prefer-number-coercion": "off",
  "unicorn/no-unnecessary-global-this": "off",
  "unicorn/prefer-number-properties": "off",
  "unicorn/no-computed-property-existence-check": "off",
  "unicorn/prefer-else-if": "off",
  "unicorn/prefer-code-point": "off",
  "unicorn/no-useless-switch-case": "off",
  "unicorn/no-unnecessary-splice": "off",
  "unicorn/prefer-number-is-safe-integer": "off",
  "unicorn/prefer-object-iterable-methods": "off",
  "unicorn/consistent-optional-chaining": "off",
  "unicorn/no-unnecessary-type-conversion": "off",
  "unicorn/no-redundant-jump": "off",
  "sonarjs/no-redundant-jump": "off",
  "unicorn/no-unsafe-string-replacement": "warn",
  "unicorn/require-array-sort-compare": "warn",
  "unicorn/prefer-await": "warn",
  "@typescript-eslint/require-await": "warn",
  "no-empty": "warn",
  "@typescript-eslint/no-empty-function": "warn",
  "@typescript-eslint/no-floating-promises": "off",

  // ── Banned pattern enforcement (banned-patterns.md) ─────────
  // Starting as "warn" — upgrade to "error" after existing violations are fixed
  "prefer-template": "warn",
};

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────
  {
    ignores: [
      "dist/",
      "node_modules/",
      "data/",
      ".tmp/",
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
  // ── Markdown files: extract & lint code blocks ─────────────────
  ...markdown.configs.recommended,
  {
    files: ["**/*.md",],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-unused-expressions": "off",
      "padded-blocks": "off",
      "eol-last": "off",
      "unicorn/filename-case": "off",
    },
  },
  // ── Server TypeScript: Bun/Node env, full type-checked rules ───
  {
    files: ["src/**/*.ts",],
    ignores: ["src/frontend/**/*.ts",],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: projectRoot,
      },
      globals: {
        ...globals.bun,
        ...globals.node,
      },
    },
    plugins: tsPlugins,
    rules: {
      ...tsRules,
      "unicorn/prefer-node-protocol": "error",
      "unicorn/no-process-exit": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true, allowAny: false, allowNullish: true, },
      ],
    },
  },
  // ── God-module pragmatic overrides (structural rules; pending split per docs/meta/code-practices-improvements/04) ──
  {
    files: [
      "src/routes/admin.ts",
      "src/routes/messages.ts",
      "src/routes/worlds.ts",
      "src/routes/characters.ts",
      "src/validation/schemas.ts",
    ],
    rules: { "unicorn/max-nested-calls": "off", },
  },
  {
    files: ["src/validation/schemas.ts",],
    rules: { "@typescript-eslint/consistent-type-definitions": "off", },
  },
  {
    files: ["src/routes/views.ts", "src/routes/characters.ts",],
    rules: { "@typescript-eslint/restrict-template-expressions": "off", },
  },
  {
    files: ["src/routes/views.ts",],
    rules: { "unicorn/no-unreadable-for-of-expression": "off", },
  },
  {
    files: ["src/config/schema.ts",],
    rules: { "unicorn/prefer-export-from": "off", },
  },
  {
    files: ["src/nsfw/moderation-service.ts",],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "unicorn/catch-error-name": "off",
    },
  },
  // ── Frontend TypeScript: Browser env, DOM-lib tsconfig ─────────
  {
    files: ["src/frontend/**/*.ts",],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
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
      "unicorn/no-process-exit": "error",
      "unicorn/prefer-uint8array-base64": "off",
      "unicorn/no-this-outside-of-class": "off",
      "unicorn/no-global-object-property-assignment": "off",
      "no-unused-vars": "off",
      // Frontend Alpine/htmx globals are `any`-typed — relax template/expression rules
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true, allowAny: true, allowNullish: true, },
      ],
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      // Alpine event handlers return promises silently
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      // --fix for these removes type assertions that frontend relies on for globalThis access
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/array-type": "off",
      // Frontend DOM patterns
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
      // Enforce apiFetch over bare fetch in frontend (warn — upgrade after violations fixed)
      "no-restricted-globals": [
        "warn",
        {
          name: "fetch",
          message: "Use apiFetch() from fe-fetch.ts instead of bare fetch (handles auth, CSRF, 401 redirect)",
        },
      ],
    },
  },
  // ── E2E test TypeScript: Bun test env ──────────────────────
  {
    files: ["tests/e2e/**/*.ts",],
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
      "unicorn/consistent-function-scoping": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "unicorn/no-await-expression-member": "off",
      "@typescript-eslint/require-await": "off",
      // Type-aware rules require parserOptions.project — disabled here
      "@typescript-eslint/no-misused-promises": "off",
      "import/no-cycle": "off",
    },
  },
  // ── Config/JS files: no TS parser, just Unicorn + SonarJS ─────
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js",],
    ignores: ["src/**/*.ts", "node_modules/**",],
    extends: [eslint.configs.recommended,],
    plugins: {
      unicorn: unicorn.configs["flat/recommended"].plugins.unicorn,
      sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
    },
    rules: {
      ...unicorn.configs["flat/recommended"].rules,
      ...sonarjs.configs.recommended.rules,

      "unicorn/prefer-module": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "sonarjs/todo-tag": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-empty-function": "off",
      "sonarjs/no-identical-functions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", },],
      // No TS parser — type-aware rules disabled
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "sonarjs/cognitive-complexity": "off",
      "import/no-cycle": "off",
    },
  },
  // ── Overrides: test files ─────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**/*.ts",],
    rules: {
      "sonarjs/no-identical-functions": "off",
      "unicorn/consistent-function-scoping": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "unicorn/no-await-expression-member": "off",
      "sonarjs/prefer-specific-assertions": "off",
      "unicorn/no-top-level-assignment-in-function": "off",
      "unicorn/no-declarations-before-early-exit": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "sonarjs/explicit-test-skip": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  // ── Overrides: scripts (utility tools, relaxed rules) ─────────────────
  {
    files: ["src/scripts/**/*.ts", "scripts/**/*.ts", "scripts/**/*.mjs",],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        allowDefaultProject: true,
        tsconfigRootDir: projectRoot,
      },
      globals: {
        ...globals.bun,
        ...globals.node,
      },
    },
    plugins: tsPlugins,
    rules: {
      "unicorn/text-encoding-identifier-case": "off",
      "unicorn/escape-case": "off",
      "unicorn/prefer-unicode-code-point-escapes": "off",
      "unicorn/prefer-node-protocol": "off",
      "unicorn/prefer-split-limit": "off",
      "unicorn/no-useless-template-literals": "off",
      "unicorn/prefer-string-raw": "off",
      "unicorn/no-process-exit": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unnecessary-template-expression": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "unicorn/prefer-await": "off",
      "unicorn/prefer-top-level-await": "off",
      // Type-aware rules require parserOptions.project — disabled here
      "@typescript-eslint/no-misused-promises": "off",
      "import/no-cycle": "off",
      "no-restricted-syntax": "off",
    },
  },
  // ── Overrides: allow bare JSON in implementation files ─────────
  {
    files: [
      "src/utils/safe-json.ts",
      "src/frontend/alpine/json.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // ── Overrides: allow bare fetch in fe-fetch implementation ─────
  {
    files: [
      "src/frontend/fe-fetch.ts",
    ],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  // ── Overrides: allow JSON.stringify in assertNever ──────────────
  {
    files: [
      "src/utils.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        // Allow JSON.stringify in assertNever (used for error messages only)
        ...customRestrictedSyntax.filter((rule,) =>
          rule.selector !== "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']"
        ),
      ],
    },
  },
);

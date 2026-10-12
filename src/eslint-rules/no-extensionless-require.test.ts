// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Linter, } from "eslint";
import tseslint from "typescript-eslint";
import { noExtensionlessRequireRule, } from "./no-extensionless-require.mjs";

// Resource contract: every case is a pure `Linter.verify` call over an inline
// snippet. No tmp files, ports, databases or cross-test mutable state, so the
// suite is order-independent and safe under `bun test --parallel --isolate`.
const linter = new Linter();

const RULE_ID = "local/no-extensionless-require";

const config: Linter.Config = {
  // Required: `verify` only applies file-matching when a filename is given, and
  // a config with no `files` then matches nothing -- every case would silently
  // return zero messages.
  files: ["**/*.ts",],
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: {
    local: { rules: { "no-extensionless-require": noExtensionlessRequireRule, }, },
  },
  rules: { [RULE_ID]: "error", },
};

/**
 * Count only this rule's reports. `verify` also returns parse errors and
 * config-level fatals, which would otherwise satisfy a `toBe(1)` assertion on a
 * snippet the parser rejected -- i.e. a test that passes without the logic ever
 * running. A null ruleId is exactly that case, so fail loudly instead.
 * @param {string} code snippet to lint
 * @param {string} filename file name the rule should see
 * @returns {number} number of reports from this rule
 */
function violations(code: string, filename = "case.test.ts",): number {
  const messages = linter.verify(code, config, filename,);
  const fatal = messages.find((message,) => message.ruleId == null);
  if (fatal) { throw new Error(`linter did not run: ${fatal.message}`,); }
  return messages.filter((message,) => message.ruleId === RULE_ID).length;
}

describe("no-extensionless-require rule", () => {
  // The exact shape that produced the suite-wide
  // `SyntaxError: JSON Parse error: Unrecognized token '/'`.
  test("flags require() of a bare relative directory in a test file", () => {
    expect(violations('const mod = require("./chat-export");',),).toBe(1,);
  });

  test("flags a nested bare relative specifier", () => {
    expect(violations('const mod = require("../../personas/service");',),).toBe(1,);
  });

  // Regression: node: builtins are package-addressed, never directory-shaped.
  test("allows node: builtins", () => {
    expect(violations('const fs = require("node:fs");',),).toBe(0,);
  });

  test("allows bun: builtins", () => {
    expect(violations('const { Database } = require("bun:sqlite");',),).toBe(0,);
  });

  // Regression: an explicit .ts entrypoint pins the require to one exact file.
  test("allows a relative specifier with an explicit .ts extension", () => {
    expect(violations('const m = require("../../chat/hallucination-guard/index.ts");',),).toBe(0,);
  });

  test("allows a relative specifier with an explicit .js extension", () => {
    expect(violations('const htmx = require("./vendor.js");',),).toBe(0,);
  });

  test("allows bare node builtins without the node: prefix", () => {
    expect(violations('const fs = require("fs"); const p = require("path");',),).toBe(0,);
  });

  // Scope guard: production code legitimately requires htmx package subpaths.
  test("does not fire outside test files", () => {
    expect(violations('const mod = require("./chat-export");', "vendor.ts",),).toBe(0,);
  });

  test("does not fire in a .spec.ts file check by name shape only", () => {
    expect(violations('const mod = require("./chat-export");', "case.spec.ts",),).toBe(1,);
  });

  // A parameter named `require` is not a module load.
  test("ignores a require() that is not the CommonJS global", () => {
    expect(violations('const x = foo.require("./chat-export");',),).toBe(0,);
  });

  // Dynamic specifiers have no statically visible extension.
  test("ignores a computed specifier", () => {
    expect(violations('const name = "./x"; const mod = require(name);',),).toBe(0,);
  });

  test("reports each bad require independently", () => {
    expect(violations('require("./a"); require("./b");',),).toBe(2,);
  });
});

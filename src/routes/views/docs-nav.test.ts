// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The sidebar docs link must follow the same resolved docs config as /docs/.
 * The old gate checked an unrelated DOCS_ENABLED env name, so a config-file
 * `docs.enabled: false` still advertised a link to a 404 endpoint.
 */
import { afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { configureDocsNav, respond, } from "./layout";

beforeAll(() => {
  // wrapWithLayout -> loadConfig -> template expansion needs a root logger.
  createLogger({ level: "error", },);
},);

afterEach(() => {
  configureDocsNav(true,);
},);

describe("docs sidebar nav", () => {
  test("renders the docs link when docs serving is enabled", async () => {
    configureDocsNav(true,);
    const html = await respond("<p>hi</p>", false, "T",).text();
    expect(html,).toContain('data-testid="nav-docs"',);
    expect(html,).toContain('href="/docs/"',);
  }, 30_000,);

  test("hides the docs link when docs serving is disabled", async () => {
    configureDocsNav(false,);
    const html = await respond("<p>hi</p>", false, "T",).text();
    expect(html,).not.toContain('data-testid="nav-docs"',);
    expect(html,).not.toContain('href="/docs/"',);
  }, 30_000,);
});

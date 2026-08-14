import { afterEach, describe, expect, test, } from "bun:test";
import { buildDenoConfig, stableStringify, transformCommand, } from "./gen-deno-config";

const SAMPLE: {
  name: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} = {
  name: "loop-lore",
  version: "0.1.0",
  scripts: {
    dev: "bun run build:frontend && bun run --watch src/server/index.ts",
    start: "bun run src/server/index.ts",
    tui: "bun run src/tui/app.ts",
    "build:frontend": "bun run scripts/build-frontend.mjs",
    "db:migrate": "bun run src/db/migrate.ts",
    docs: "bunx vitepress dev docs",
    test: "bun test --isolate",
    "test:e2e": "bun test ./tests/e2e/flows/browser/smoke.browser.ts",
    build: "bun run build:frontend && bun run build:server",
    "build:server": "bun build src/server/index.ts --outdir ./dist --target bun",
  },
  dependencies: { elysia: "^1.4.29", kysely: "^0.29.4", },
  devDependencies: { vitepress: "^1.6.4", eslint: "^10.8.0", },
};

describe("transformCommand", () => {
  const names = new Set(Object.keys(SAMPLE.scripts,),);

  test("bun run <script> → deno task <script>", () => {
    expect(transformCommand("bun run build:frontend", names,),).toBe("deno task build:frontend",);
  });

  test("bun run <file> → deno run <file>", () => {
    expect(transformCommand("bun run src/server/index.ts", names,),).toBe("deno run src/server/index.ts",);
  });

  test("preserves && with spacing", () => {
    expect(transformCommand("bun run build:frontend && bun run --watch src/server/index.ts", names,),).toBe(
      "deno task build:frontend && deno run --watch src/server/index.ts",
    );
  });

  test("bunx <pkg> → deno run -A npm:<pkg>", () => {
    expect(transformCommand("bunx vitepress dev docs", names,),).toBe("deno run -A npm:vitepress dev docs",);
  });

  test("bun test → deno test", () => {
    expect(transformCommand("bun test --isolate", names,),).toBe("deno test --isolate",);
  });

  test("bun build is left to bun (no deno subcommand)", () => {
    expect(transformCommand("bun build src/server/index.ts --outdir ./dist", names,),).toBe(
      "bun build src/server/index.ts --outdir ./dist",
    );
  });
});

describe("buildDenoConfig", () => {
  const cfg = buildDenoConfig(SAMPLE,);

  test("sets nodeModulesDir auto + sloppy-imports", () => {
    expect(cfg.nodeModulesDir,).toBe("auto",);
    expect(cfg.unstable,).toContain("sloppy-imports",);
  });

  test("imports map every dependency to npm:", () => {
    expect(cfg.imports.elysia,).toBe("npm:elysia@^1.4.29",);
    expect(cfg.imports.kysely,).toBe("npm:kysely@^0.29.4",);
    expect(cfg.imports.vitepress,).toBe("npm:vitepress@^1.6.4",);
    expect(cfg.imports.eslint,).toBe("npm:eslint@^10.8.0",);
  });

  test("tasks mirror scripts with bun→deno transform", () => {
    expect(cfg.tasks.start,).toBe("deno run src/server/index.ts",);
    expect(cfg.tasks.docs,).toBe("deno run -A npm:vitepress dev docs",);
    expect(cfg.tasks["build:server"],).toBe("bun build src/server/index.ts --outdir ./dist --target bun",);
  });
});

describe("idempotency", () => {
  test("re-running buildDenoConfig yields byte-identical output", () => {
    const a = stableStringify(buildDenoConfig(SAMPLE,),);
    const b = stableStringify(buildDenoConfig(SAMPLE,),);
    expect(a,).toBe(b,);
  });

  test("key ordering is stable regardless of input key order", () => {
    const shuffled = {
      ...SAMPLE,
      dependencies: { kysely: "^0.29.4", elysia: "^1.4.29", },
      devDependencies: { eslint: "^10.8.0", vitepress: "^1.6.4", },
    };
    const a = stableStringify(buildDenoConfig(SAMPLE,),);
    const b = stableStringify(buildDenoConfig(shuffled,),);
    expect(a,).toBe(b,);
  });

  test("stableStringify sorts nested keys deterministically", () => {
    const obj = { b: 1, a: { d: 4, c: 3, }, e: [2, 1,], };
    expect(stableStringify(obj,),).toBe(
      JSON.stringify({ a: { c: 3, d: 4, }, b: 1, e: [2, 1,], }, null, 2,) + "\n",
    );
  });
});

afterEach(() => {
  // no shared state to reset
},);

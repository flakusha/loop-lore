// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { adminImportWizard, } from "./admin-import-wizard";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (t: string, m: string,) => void };
const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json({},);
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
},);

function freshHost(systemConfig: { key: string }[] = [],) {
  const host = {} as { systemConfig: { key: string }[]; loadSystemConfig(): Promise<void> };
  host.systemConfig = systemConfig;
  host.loadSystemConfig = async () => {};
  Object.assign(host, adminImportWizard.call(host as never,),);
  return host as any;
}

describe("adminImportWizard open/cancel", () => {
  test("open resets state to step 1", () => {
    const h = freshHost();
    h.importWizard.step = 3;
    h.importWizard.preview = [{ key: "k", value: "v", isSecret: false, willOverwrite: false, },];
    h.importWizard.error = "err";
    h.importWizard.fileName = "f";
    h.openImportWizard();
    expect(h.importWizard.open,).toBe(true,);
    expect(h.importWizard.step,).toBe(1,);
    expect(h.importWizard.preview,).toEqual([],);
    expect(h.importWizard.error,).toBe("",);
    expect(h.importWizard.fileName,).toBe("",);
  });

  test("cancel closes", () => {
    const h = freshHost();
    h.openImportWizard();
    h.cancelImport();
    expect(h.importWizard.open,).toBe(false,);
  });
});

describe("handleFileSelect", () => {
  test("rejects files over 1MB", async () => {
    const h = freshHost();
    h.openImportWizard();
    const file = new File(["x",], "a.yaml", { type: "text/yaml", },);
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024, },);
    const input = { files: [file,], } as unknown as HTMLInputElement;
    await h.handleFileSelect({ target: input, } as unknown as Event,);
    expect(h.importWizard.error,).toBe("File exceeds 1MB limit",);
    expect(h.importWizard.step,).toBe(1,);
  });

  test("rejects unknown extension", async () => {
    const h = freshHost();
    h.openImportWizard();
    const file = new File(["x",], "a.json",);
    const input = { files: [file,], } as unknown as HTMLInputElement;
    await h.handleFileSelect({ target: input, } as unknown as Event,);
    expect(h.importWizard.error,).toBe("Unknown format — use .yaml, .yml, or .toml",);
  });

  test("yaml file advances to step 2 with preview", async () => {
    const h = freshHost([{ key: "foo", },],);
    h.openImportWizard();
    const content = "system_config:\n  foo: bar\n  secret_token: s\n";
    const file = new File([content,], "cfg.yaml",);
    const input = { files: [file,], } as unknown as HTMLInputElement;
    await h.handleFileSelect({ target: input, } as unknown as Event,);
    expect(h.importWizard.format,).toBe("yaml",);
    expect(h.importWizard.step,).toBe(2,);
    expect(h.importWizard.preview.length,).toBe(2,);
    const foo = h.importWizard.preview.find((r: any,) => r.key === "foo");
    expect(foo.willOverwrite,).toBe(true,);
    const sec = h.importWizard.preview.find((r: any,) => r.key === "secret_token");
    expect(sec.isSecret,).toBe(true,);
  });

  test("no file does nothing", async () => {
    const h = freshHost();
    h.openImportWizard();
    const input = { files: [], } as unknown as HTMLInputElement;
    await h.handleFileSelect({ target: input, } as unknown as Event,);
    expect(h.importWizard.step,).toBe(1,);
  });
});

describe("parsers", () => {
  test("parseSimpleYaml", () => {
    const h = freshHost();
    const r = h.parseSimpleYaml('system_config:\n  a: 1\n  b: "two"\nother: x\n',);
    expect(r.system_config,).toEqual({ a: "1", b: "two", },);
  });

  test("parseSimpleToml", () => {
    const h = freshHost();
    const r = h.parseSimpleToml('[system_config]\na = "1"\n"k.x" = "v"\n[other]\n',);
    expect(r.system_config,).toEqual({ a: "1", "k.x": "v", },);
  });
});

describe("stringifiers", () => {
  test("stringifySimpleYaml", () => {
    const h = freshHost();
    const out = h.stringifySimpleYaml([{ key: "a", value: "1", },],);
    expect(out,).toBe('system_config:\n  a: "1"\n',);
  });

  test("stringifySimpleToml", () => {
    const h = freshHost();
    const out = h.stringifySimpleToml([{ key: "a", value: "1", },],);
    expect(out,).toBe('[system_config]\n"a" = "1"\n',);
  });
});

describe("confirmImport", () => {
  test("success closes wizard and reloads config", async () => {
    const h = freshHost();
    h.openImportWizard();
    h.importWizard.format = "yaml";
    h.importWizard.preview = [{ key: "a", value: "1", isSecret: false, willOverwrite: false, },];
    let reloaded = false;
    h.loadSystemConfig = async () => {
      reloaded = true;
    };

    handler = async () => Response.json({ imported: 1, changed: 0, skipped: 0, conflicts: 0, },);
    await h.confirmImport();
    expect(h.importWizard.open,).toBe(false,);
    expect(toasts[0]!,).toEqual({ type: "success", message: "Imported 1, changed 0, skipped 0, conflicts 0", },);
    expect(reloaded,).toBe(true,);
    expect(calls[0]!.url,).toBe("/api/v1/admin/system-config/import",);
  });

  test("http error sets error", async () => {
    const h = freshHost();
    h.openImportWizard();
    h.importWizard.format = "yaml";
    h.importWizard.preview = [{ key: "a", value: "1", isSecret: false, willOverwrite: false, },];
    handler = async () => Response.json({ message: "bad", }, { status: 400, },);
    await h.confirmImport();
    expect(h.importWizard.error,).toBe("bad",);
    expect(h.importWizard.open,).toBe(true,);
  });

  test("network error sets error", async () => {
    const h = freshHost();
    h.openImportWizard();
    h.importWizard.format = "yaml";
    h.importWizard.preview = [{ key: "a", value: "1", isSecret: false, willOverwrite: false, },];
    handler = async () => {
      throw new Error("net",);
    };

    await h.confirmImport();
    expect(h.importWizard.error,).toBe("net",);
  });
});

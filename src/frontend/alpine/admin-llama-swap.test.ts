// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import { type AdminLlamaSwapState, createAdminLlamaSwap, type LlamaSwapStatus, } from "./admin-llama-swap";
import { t, } from "./i18n";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (...args: unknown[]) => void };
const originalFetch = g.apiFetch;
const originalToast = g.showToast;

const STATUS: LlamaSwapStatus = {
  configured: true,
  autoStartEnabled: true,
  listenPort: 8080,
  configPath: "/etc/llama-swap.yml",
  running: false,
  note: "runtime state unavailable",
};

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let state: AdminLlamaSwapState;

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  g.showToast = () => {};
  state = createAdminLlamaSwap();
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.showToast = originalToast;
},);

test("loadStatus stores contracted fields including the runtime note", async () => {
  handler = async () => Response.json(STATUS,);

  await state.loadStatus();

  expect(state.status,).toEqual(STATUS,);
  expect(state.form,).toEqual({ autoStartEnabled: true, listenPort: "8080", configPath: "/etc/llama-swap.yml", },);
  expect(state.loading,).toBe(false,);
  expect(calls[0]?.url,).toBe("/api/v1/admin/llama-swap/status",);
});

test("loadStatus surfaces the server error", async () => {
  handler = async () => Response.json({ message: "permission denied", }, { status: 403, },);

  await state.loadStatus();

  expect(state.error,).toBe("permission denied",);
  expect(state.loading,).toBe(false,);
});

test("saveConfig PATCHes the edited fields and reports the result", async () => {
  state.form.autoStartEnabled = false;
  state.form.listenPort = " 9090 ";
  state.form.configPath = " /opt/swap.yml ";
  handler = async () =>
    Response.json({
      configured: true,
      autoStartEnabled: false,
      listenPort: 9090,
      configPath: "/opt/swap.yml",
      running: true,
    },);

  await state.saveConfig();

  expect(calls[0]?.url,).toBe("/api/v1/admin/llama-swap/config",);
  expect(calls[0]?.opts?.method,).toBe("PATCH",);
  expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({
    autoStartEnabled: false,
    listenPort: 9090,
    configPath: "/opt/swap.yml",
  },);

  expect(state.status.running,).toBe(true,);
  expect(state.form.listenPort,).toBe("9090",);
  expect(state.message,).toBe(t("admin.localModels.llamaSwap.saveDone",),);
  expect(state.saving,).toBe(false,);
});

test("saveConfig rejects an invalid port without a request", async () => {
  state.form.listenPort = "70000";

  await state.saveConfig();

  expect(calls,).toHaveLength(0,);
  expect(state.error,).toBe(t("admin.localModels.llamaSwap.invalidPort",),);
});

test("saveConfig surfaces a failed PATCH with the server message", async () => {
  handler = async () => Response.json({ message: "config path is not writable", }, { status: 400, },);

  await state.saveConfig();

  expect(state.error,).toBe("config path is not writable",);
  expect(state.saving,).toBe(false,);
});

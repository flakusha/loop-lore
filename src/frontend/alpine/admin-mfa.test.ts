// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import { type AdminMfaState, createAdminMfa, type MfaConfig, } from "./admin-mfa";
import { t, } from "./i18n";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (...args: unknown[]) => void };
const originalFetch = g.apiFetch;
const originalToast = g.showToast;

const CONFIG: MfaConfig = {
  email: { sender: "noreply@example.com", windowMs: 300000, configured: true, },
  messenger: { sender: "bot@example.com", windowMs: 600000, tokenConfigured: true, },
};

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let state: AdminMfaState;

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  g.showToast = () => {};
  state = createAdminMfa();
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.showToast = originalToast;
},);

test("loadConfig stores channel status and never keeps a token from the response", async () => {
  handler = async () => Response.json({ ...CONFIG, messenger: { ...CONFIG.messenger, botToken: "super-secret", }, },);

  await state.loadConfig();

  expect(state.config,).toEqual(CONFIG,);
  expect(JSON.stringify(state.config,),).not.toContain("super-secret",);
  expect(state.form.messenger.botToken,).toBe("",);
  expect(state.form.email.windowMs,).toBe("300000",);
  expect(calls[0]?.url,).toBe("/api/v1/admin/mfa/config",);
});

test("loadConfig surfaces a server error", async () => {
  handler = async () => Response.json({ message: "permission denied", }, { status: 403, },);

  await state.loadConfig();

  expect(state.error,).toBe("permission denied",);
  expect(state.loading,).toBe(false,);
});

test("saveConfig sends write-only token and clears the input afterwards", async () => {
  state.form.email.sender = " admin@example.com ";
  state.form.email.windowMs = " 120000 ";
  state.form.messenger.sender = " messenger@example.com ";
  state.form.messenger.windowMs = "600000";
  state.form.messenger.botToken = " new-token ";
  handler = async () => Response.json(CONFIG,);

  await state.saveConfig();

  expect(calls[0]?.opts?.method,).toBe("PATCH",);
  expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({
    email: { sender: "admin@example.com", windowMs: 120000, },
    messenger: { sender: "messenger@example.com", windowMs: 600000, botToken: "new-token", },
  },);

  expect(state.form.messenger.botToken,).toBe("",);
  expect(state.message,).toBe(t("admin.mfa.saveDone",),);
  expect(state.saving,).toBe(false,);
});

test("saveConfig rejects a non-positive window without a request", async () => {
  state.form.email.windowMs = "0";
  state.form.messenger.windowMs = "600000";

  await state.saveConfig();

  expect(calls,).toHaveLength(0,);
  expect(state.error,).toBe(t("admin.mfa.invalidWindow",),);
});

test("saveConfig omits botToken when the operator left it empty", async () => {
  state.form.email.windowMs = "300000";
  state.form.messenger.windowMs = "600000";
  handler = async () => Response.json(CONFIG,);

  await state.saveConfig();

  expect(JSON.parse(String(calls[0]?.opts?.body,),),).not.toHaveProperty("messenger.botToken",);
  expect(JSON.parse(String(calls[0]?.opts?.body,),).messenger,).not.toHaveProperty("botToken",);
});

test("saveConfig surfaces a failed PATCH with the server message", async () => {
  state.form.email.windowMs = "300000";
  state.form.messenger.windowMs = "600000";
  handler = async () => Response.json({ message: "sender not verified", }, { status: 400, },);

  await state.saveConfig();

  expect(state.error,).toBe("sender not verified",);
  expect(state.saving,).toBe(false,);
});

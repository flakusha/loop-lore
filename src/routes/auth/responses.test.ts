// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { HttpStatus, type HttpStatusCode, } from "../http-utils";
import {
  errorHtml,
  errorJson,
  errorResponse,
  escapeHtml,
  getTokenFromCookie,
  wantsJson,
} from "./responses";

function req(headers: Record<string, string>,): Request {
  return new Request("http://localhost/api/auth/login", { headers, },);
}

describe("wantsJson — content negotiation (BUG-auth-login-silent-fail)", () => {
  test("HX-Request: true always wins (htmx swap contract preserved)", () => {
    expect(wantsJson(req({ "HX-Request": "true", Accept: "application/json", },),),).toBe(false,);
  });

  test("Accept: application/json without text/html → JSON envelope", () => {
    expect(wantsJson(req({ Accept: "application/json", },),),).toBe(true,);
  });

  test("Accept with both json and html → HTML wins (caller prefers rendering)", () => {
    expect(wantsJson(req({ Accept: "application/json, text/html", },),),).toBe(false,);
  });

  test("no headers → legacy htmx form default (HTML)", () => {
    expect(wantsJson(req({},),),).toBe(false,);
  });

  test("Accept matching is case-insensitive", () => {
    expect(wantsJson(req({ Accept: "APPLICATION/JSON", },),),).toBe(true,);
  });
});

describe("escapeHtml / errorHtml", () => {
  test("escapes the five dangerous entities", () => {
    expect(escapeHtml(`<a href="x">&'`,),).toBe("&lt;a href=&quot;x&quot;&gt;&amp;'",);
  });

  test("errorHtml returns 200 + inline error-msg paragraph (htmx swap contract)", async () => {
    const res = errorHtml("<script>alert(1)</script>",);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toBe("text/html; charset=utf-8",);
    const body = await res.text();
    expect(body.startsWith(`<p class="error-msg">&lt;script&gt;`,),).toBe(true,);
    expect(body.includes("<script>",),).toBe(false,);
  });
});

describe("errorJson", () => {
  test("maps status to the http-utils envelope code", async () => {
    const res = errorJson(HttpStatus.Unauthorized, "bad credentials",);
    expect(res.status,).toBe(401,);
    expect(res.headers.get("Content-Type",),).toBe("application/json",);
    const body = (await res.json()) as { error: string; code: string; meta: { api_version: string } };
    expect(body.error,).toBe("bad credentials",);
    expect(body.code,).toBe("UNAUTHORIZED",);
    expect(body.meta.api_version,).toBe("1",);
  });

  test("unknown status falls back to generic ERROR code", async () => {
    const res = errorJson(599 as HttpStatusCode, "odd",);
    const body = (await res.json()) as { code: string };
    expect(body.code,).toBe("ERROR",);
  });

  test("uses the translator when provided", async () => {
    const res = errorJson(HttpStatus.BadRequest, "key.login", () => "bad request translated",);
    const body = (await res.json()) as { error: string };
    expect(body.error,).toBe("bad request translated",);
  });
});

describe("errorResponse — single content-negotiating error path", () => {
  test("JSON client → real 4xx envelope (no silent 200)", async () => {
    const res = errorResponse(req({ Accept: "application/json", },), HttpStatus.Forbidden, "denied",);
    expect(res.status,).toBe(403,);
    const body = (await res.json()) as { code: string };
    expect(body.code,).toBe("FORBIDDEN",);
  });

  test("htmx form post → 200 + HTML with fallback message", async () => {
    const res = errorResponse(
      req({ "HX-Request": "true", Accept: "text/html", },),
      HttpStatus.Unauthorized,
      "auth.invalid-credentials",
      undefined,
      "Invalid username or password",
    );
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("Invalid username or password",);
  });

  test("translator output wins over fallback on the HTML path", async () => {
    const res = errorResponse(
      req({ "HX-Request": "true", },),
      HttpStatus.BadRequest,
      "auth.bad-request",
      (key,) => key === "auth.bad-request" ? "translated text" : key,
      "fallback",
    );
    expect(await res.text(),).toContain("translated",);
  });

  test("HTML path without translator or fallback echoes the raw key as message", async () => {
    const res = errorResponse(req({ "HX-Request": "true", },), HttpStatus.Conflict, "conflict-msg",);
    expect(await res.text(),).toContain("conflict-msg",);
  });
});

describe("getTokenFromCookie", () => {
  test("no Cookie header → null", () => {
    expect(getTokenFromCookie(req({},),),).toBeNull();
  });

  test("extracts ll_token value", () => {
    expect(getTokenFromCookie(req({ Cookie: "other=x; ll_token=abc123; csrf=t", },),),).toBe("abc123",);
  });

  test("ll_token as first cookie", () => {
    expect(getTokenFromCookie(req({ Cookie: "ll_token=tok-1", },),),).toBe("tok-1",);
  });

  test("no ll_token in header → null", () => {
    expect(getTokenFromCookie(req({ Cookie: "a=b; c=d", },),),).toBeNull();
  });
});

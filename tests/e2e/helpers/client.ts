// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Test Client
 *
 * Lightweight fetch wrapper for E2E test flows.
 * Handles base URL, auto-auth token injection, response parsing, and the
 * CSRF double-submit dance: unsafe methods (POST/PUT/PATCH/DELETE) must
 * carry the `csrf_token` cookie AND a matching `X-CSRF-Token` header bound
 * to the current session (see src/middleware/csrf.ts::decideCsrf).
 *
 * Token lifecycle mirrors a browser:
 *   - any response may Set-Cookie a `csrf_token`; we capture it,
 *   - a token seen while unauthenticated is bound to `anonymous::<requestId>`
 *     and NOT reusable once we hold a session → tracked via `csrfSessionBound`,
 *   - before the first unsafe request with a session, we refresh via one
 *     authenticated GET (safe method → server issues a session-bound token).
 */

export interface ApiResponse<T = unknown,> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  code: string | null; // Error envelope code (TEST.2)
}

/** Methods that the CSRF middleware gates (must mirror UNSAFE_METHODS in src/middleware/csrf.ts). */
const UNSAFE_METHODS: Record<string, true> = { DELETE: true, PATCH: true, POST: true, PUT: true, };

/**
 * Create an API client bound to a test server URL.
 * After login() is called, subsequent requests include the auth cookie and
 * the CSRF pair for unsafe methods.
 * @param baseUrl
 */
export function createClient(baseUrl: string,) {
  let token: string | null = null;
  let csrfToken: string | null = null;
  // True when csrfToken was captured on a request that carried a session
  // token (⇒ bound to sessionId). False for anonymous-bound tokens.
  let csrfSessionBound = false;

  /** Capture ll_token / csrf_token from any Set-Cookie headers on a response. */
  function absorbCookies(res: Response,): void {
    const raws: string[] = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("Set-Cookie",) ?? "",];
    for (const raw of raws) {
      const lm = /(?:^|,\s*)ll_token=([^;]+)/.exec(raw,);
      if (lm) { token = lm[1] ?? null; }
      const cm = /(?:^|,\s*)csrf_token=([^;]+)/.exec(raw,);
      if (cm && cm[1] !== "") {
        csrfToken = cm[1] ?? null;
        // A csrf cookie arriving on a response to a request that carried the
        // session token is session-bound; otherwise it is anonymous-bound.
        csrfSessionBound = carriedSession;
      }
    }
  }

  // Set by request() before fetch so absorbCookies knows whether the
  // outgoing request was session-authenticated.
  let carriedSession = false;

  async function request<T = unknown,>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string> },
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...opts?.headers, };

    if (body != null && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    // Session-authenticated unsafe request with a missing or anonymous-bound
    // CSRF token → refresh once via an authenticated GET (issues a
    // session-bound token, exactly like a browser page load).
    const isUnsafe = method.toUpperCase() in UNSAFE_METHODS;
    if (isUnsafe && token && (!csrfToken || !csrfSessionBound)) {
      await bootstrapCsrf();
    }

    const cookies: string[] = [];
    if (token) { cookies.push(`ll_token=${token}`,); }
    if (csrfToken) { cookies.push(`csrf_token=${csrfToken}`,); }
    carriedSession = token !== null;
    if (cookies.length > 0) {
      headers["Cookie"] = cookies.join("; ",);
    }
    if (isUnsafe && csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body,),
      redirect: "manual", // don't follow HX-Redirect
    },);

    absorbCookies(res,);

    let data: T | null = null;
    let error: string | null = null;
    let code: string | null = null;

    const contentType = res.headers.get("content-type",) ?? "";
    if (contentType.includes("application/json",)) {
      try {
        const json = await res.json();
        if (res.ok) {
          data = json as T;
        } else {
          error = json.error ?? `HTTP ${res.status}`;
          code = json.code ?? null;
        }
      } catch {
        error = `Failed to parse JSON response (status ${res.status})`;
      }
    } else {
      // Non-JSON response — read as text for error
      try {
        const text = await res.text();
        if (!res.ok) {
          error = text || `HTTP ${res.status}`;
        }
      } catch {
        error = `Failed to read response (status ${res.status})`;
      }
    }

    return { ok: res.ok, status: res.status, data, error, code, };
  }

  /** One authenticated GET so the server re-issues a session-bound CSRF token. */
  async function bootstrapCsrf(): Promise<void> {
    await request<unknown>("GET", "/api/auth/me",);
  }

  return {
    get token(): string | null {
      return token;
    },
    get csrfToken(): string | null {
      return csrfToken;
    },

    setToken(t: string | null,) {
      token = t;
      // Binding of any held token is now unknown — force a re-bootstrap.
      csrfSessionBound = false;
    },

    get<T = unknown,>(path: string,): Promise<ApiResponse<T>> {
      return request<T>("GET", path,);
    },

    post<T = unknown,>(path: string, body?: unknown,): Promise<ApiResponse<T>> {
      return request<T>("POST", path, body,);
    },

    put<T = unknown,>(path: string, body?: unknown,): Promise<ApiResponse<T>> {
      return request<T>("PUT", path, body,);
    },

    patch<T = unknown,>(path: string, body?: unknown,): Promise<ApiResponse<T>> {
      return request<T>("PATCH", path, body,);
    },

    del<T = unknown,>(path: string, body?: unknown,): Promise<ApiResponse<T>> {
      return request<T>("DELETE", path, body,);
    },

    upload<T = unknown,>(path: string, formData: FormData,): Promise<ApiResponse<T>> {
      return request<T>("POST", path, formData,);
    },

    /**
     * Authenticate via demo-login.
     * Returns true on success.
     */
    async login(): Promise<boolean> {
      const res = await this.post("/api/demo-login",);
      if (res.ok) {
        await bootstrapCsrf();
      }
      return res.ok;
    },

    /**
     * Authenticate as a specific user via /api/auth/login.
     * Returns true on success.
     */
    async loginAs(username: string, password: string,): Promise<boolean> {
      const formBody = new URLSearchParams({ username, password, },).toString();
      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", };
      if (token) { headers["Cookie"] = `ll_token=${token}`; }
      // Reset process-global login rate limiter so test files don't trip it
      // (limiter is keyed by IP and shared across test servers in the same bun process).
      const { resetLoginRateLimiter, } = await import("@/routes/auth");
      resetLoginRateLimiter();
      carriedSession = token !== null;
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers,
        body: formBody,
        redirect: "manual",
      },);
      absorbCookies(res,);
      if (res.ok) {
        await bootstrapCsrf();
      }
      return res.ok;
    },

    /**
     * Clear auth token.
     */
    logout() {
      token = null;
      csrfToken = null;
      csrfSessionBound = false;
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;

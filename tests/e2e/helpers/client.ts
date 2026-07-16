/**
 * E2E Test Client
 *
 * Lightweight fetch wrapper for E2E test flows.
 * Handles base URL, auto-auth token injection, response parsing.
 */

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  code: string | null; // Error envelope code (TEST.2)
}

/**
 * Create an API client bound to a test server URL.
 * After login() is called, subsequent requests include the auth cookie.
 */
export function createClient(baseUrl: string) {
  let token: string | null = null;

  async function request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string> },
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...opts?.headers };

    if (body != null && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    // Include auth cookie via Cookie header
    if (token) {
      headers["Cookie"] = `ll_token=${token}`;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual", // don't follow HX-Redirect
    });

    // Extract Set-Cookie for auth token
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) {
      const match = /ll_token=([^;]+)/.exec(setCookie);
      if (match) {
        token = match[1];
      }
    }

    let data: T | null = null;
    let error: string | null = null;
    let code: string | null = null;

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
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

    return { ok: res.ok, status: res.status, data, error, code };
  }

  return {
    get token(): string | null {
      return token;
    },

    setToken(t: string | null) {
      token = t;
    },

    get<T = unknown>(path: string): Promise<ApiResponse<T>> {
      return request<T>("GET", path);
    },

    post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
      return request<T>("POST", path, body);
    },

    put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
      return request<T>("PUT", path, body);
    },

    patch<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
      return request<T>("PATCH", path, body);
    },

    del<T = unknown>(path: string): Promise<ApiResponse<T>> {
      return request<T>("DELETE", path);
    },

    upload<T = unknown>(path: string, formData: FormData): Promise<ApiResponse<T>> {
      return request<T>("POST", path, formData);
    },

    /**
     * Authenticate via demo-login.
     * Returns true on success.
     */
    async login(): Promise<boolean> {
      const res = await this.post("/api/demo-login");
      return res.ok;
    },

    /**
     * Authenticate as a specific user via /api/auth/login.
     * Returns true on success.
     */
    async loginAs(username: string, password: string): Promise<boolean> {
      const formBody = new URLSearchParams({ username, password }).toString();
      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
      if (token) headers["Cookie"] = `ll_token=${token}`;
      // Reset process-global login rate limiter so test files don't trip it
      // (limiter is keyed by IP and shared across test servers in the same bun process).
      const { resetLoginRateLimiter } = await import("@/routes/auth");
      resetLoginRateLimiter();
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers,
        body: formBody,
        redirect: "manual",
      });
      const setCookie = res.headers.get("Set-Cookie");
      if (setCookie) {
        const match = /ll_token=([^;]+)/.exec(setCookie);
        if (match) token = match[1];
      }
      return res.ok;
    },

    /**
     * Clear auth token.
     */
    logout() {
      token = null;
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;
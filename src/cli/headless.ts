// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 370
/**
 * Headless CLI HTTP layer — chat, generation, assets, characters.
 *
 * Non-interactive fetch wrappers behind `bin/lolo.ts`. Auth mirrors the
 * TUI pattern: Bearer `[tui].sessionToken` when set, anonymous otherwise.
 * Base URL from `LOOP_LORE_API_BASE_URL` (default `http://localhost:3000`).
 *
 * All functions return a result union; callers print `{ data }` / `{ error }`
 * JSON and exit non-zero on the error arm. Module stays fetch-injectable
 * (`setHeadlessFetch`) so `bin/lolo.headless.test.ts` pins dispatch without
 * touching the network.
 */

import { jsonStringifyOr, safeJsonParse, } from "../utils";

export const HEADLESS_API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000";

/** Result union shared by every headless call. */
export type HeadlessResult<T,> = { ok: true; data: T } | { ok: false; error: string; status?: number };

type FetchFn = typeof fetch;
let _fetch: FetchFn = fetch;

/** Double-submit CSRF cookie jar (mirrors the browser dance in tests/e2e/helpers/client.ts). */
let _csrfToken: string | null = null;

/**
 * Reset the CSRF jar (tests only).
 */
export function resetHeadlessCsrf(): void {
  _csrfToken = null;
}

function absorbCsrf(response: Response,): void {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const raws = typeof getSetCookie === "function"
    ? getSetCookie.call(response.headers,)
    : [response.headers.get("set-cookie",) ?? "",];

  for (const raw of raws) {
    const match = /(?:^|,\s*)csrf_token=([^;]+)/.exec(raw,);
    if (match?.[1]) { _csrfToken = match[1]; }
  }
}

async function ensureCsrf(sessionToken: string | undefined,): Promise<void> {
  if (_csrfToken) { return; }
  try {
    const response = await _fetch(`${HEADLESS_API_BASE}/api/v1/auth/me`, {
      headers: { ...authHeaders(sessionToken,), },
      signal: AbortSignal.timeout(30_000,),
    },);

    absorbCsrf(response,);
    await response.text().catch(() => "");
  } catch {
    // Unreachable server surfaces at the real call; a missing jar just means
    // the call goes out without CSRF and the server answers 403 honestly.
  }
}

/**
 * Swap the HTTP client (tests only).
 * @param fn - replacement for global fetch
 */
export function setHeadlessFetch(fn: FetchFn,): void {
  _fetch = fn;
}

function authHeaders(sessionToken: string | undefined,): Record<string, string> {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}`, } : {};
}

async function readErrorText(response: Response,): Promise<string> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return `HTTP ${response.status}`;
  }

  const parsed = safeJsonParse<{ error?: string }>(text,);
  if (parsed.ok && typeof parsed.value.error === "string" && parsed.value.error.length > 0) {
    return parsed.value
      .error;
  }

  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500,) : `HTTP ${response.status}`;
}

async function parseJson<T,>(response: Response,): Promise<HeadlessResult<T>> {
  let text: string;
  try {
    text = await response.text();
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), status: response.status, };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: await readErrorText(new Response(text, { status: response.status, },),),
      status: response.status,
    };
  }

  const parsed = safeJsonParse<T>(text,);
  if (parsed.ok) { return { ok: true, data: parsed.value, }; }
  return { ok: false, error: "Response body is not valid JSON", status: response.status, };
}

async function postJson<T,>(
  path: string,
  body: unknown,
  sessionToken: string | undefined,
): Promise<HeadlessResult<T>> {
  await ensureCsrf(sessionToken,);
  let response: Response;
  try {
    response = await _fetch(`${HEADLESS_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(sessionToken,),
        ...(_csrfToken ? { Cookie: `csrf_token=${_csrfToken}`, "X-CSRF-Token": _csrfToken, } : {}),
      },
      body: jsonStringifyOr(body,),
      signal: AbortSignal.timeout(300_000,),
    },);

    absorbCsrf(response,);
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  return parseJson<T>(response,);
}

async function getJson<T,>(path: string, sessionToken: string | undefined,): Promise<HeadlessResult<T>> {
  let response: Response;
  try {
    response = await _fetch(`${HEADLESS_API_BASE}${path}`, {
      headers: { ...authHeaders(sessionToken,), },
      signal: AbortSignal.timeout(30_000,),
    },);
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  return parseJson<T>(response,);
}

/**
 * Create a chat via POST /api/v1/chats.
 * @param name - chat name
 * @param sessionToken - bearer token; omit for solo anonymous
 */
export function headlessChatCreate(
  name: string,
  sessionToken: string | undefined,
): Promise<HeadlessResult<{ id: string }>> {
  return postJson("/api/v1/chats", { name, }, sessionToken,);
}

/**
 * Send a message via POST /api/v1/chats/:id/messages.
 * @param chatId - target chat
 * @param content - message text
 * @param sessionToken - bearer token; omit for solo anonymous
 * @param extra - optional idempotencyKey / attachments passthrough
 */
export function headlessChatSend(
  chatId: string,
  content: string,
  sessionToken: string | undefined,
  extra?: { idempotencyKey?: string; attachments?: { assetId: string }[] },
): Promise<HeadlessResult<{ id: string }>> {
  return postJson(`/api/v1/chats/${encodeURIComponent(chatId,)}/messages`, {
    content,
    ...(extra?.idempotencyKey ? { idempotencyKey: extra.idempotencyKey, } : {}),
    ...(extra?.attachments ? { attachments: extra.attachments, } : {}),
  }, sessionToken,);
}

/**
 * Read one page of a chat's messages via GET /api/v1/chats/:id/messages.
 * @param chatId - target chat
 * @param sessionToken - bearer token; omit for solo anonymous
 * @param page - 1-based page
 * @param pageSize - rows per page
 */
export function headlessChatHistory(
  chatId: string,
  sessionToken: string | undefined,
  page = 1,
  pageSize = 20,
): Promise<HeadlessResult<{ data: unknown[]; total: number }>> {
  const query = new URLSearchParams({ page: String(page,), pageSize: String(pageSize,), },);
  return getJson(`/api/v1/chats/${encodeURIComponent(chatId,)}/messages?${query}`, sessionToken,);
}

/** Body for POST /api/v1/generation/generate (CLI-relevant subset). */
export interface HeadlessGenerateBody {
  chatId: string;
  parentMessageId: string;
  actorId: string;
  idempotencyKey: string;
  stream?: boolean;
  prompt?: { role: "user" | "system"; content: string }[];
  provider?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Run a generation via POST /api/v1/generation/generate.
 * @param body - generate request (idempotencyKey auto-minted by the caller when absent)
 * @param sessionToken - bearer token; omit for solo anonymous
 */
export function headlessGenerate(
  body: HeadlessGenerateBody,
  sessionToken: string | undefined,
): Promise<HeadlessResult<{ messageId: string; content: string } & Record<string, unknown>>> {
  return postJson("/api/v1/generation/generate", body, sessionToken,);
}

/**
 * Consume GET /api/v1/generation/stream/:chatId SSE and return concatenated text.
 * @param chatId - chat whose stream buffer to read
 * @param sessionToken - bearer token; omit for solo anonymous
 */
export async function headlessGenerateStream(
  chatId: string,
  sessionToken: string | undefined,
): Promise<HeadlessResult<{ text: string }>> {
  let response: Response;
  try {
    response = await _fetch(
      `${HEADLESS_API_BASE}/api/v1/generation/stream/${encodeURIComponent(chatId,)}`,
      {
        headers: { Accept: "text/event-stream", ...authHeaders(sessionToken,), },
        signal: AbortSignal.timeout(300_000,),
      },
    );
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  if (!response.ok || !response.body) {
    return { ok: false, error: await readErrorText(response,), status: response.status, };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let buf = "";
  try {
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      buf += decoder.decode(value, { stream: true, },);
      let idx: number;
      while ((idx = buf.indexOf("\n\n",)) >= 0) {
        const frame = buf.slice(0, idx,);
        buf = buf.slice(idx + 2,);
        const eventLine = frame.split("\n",).find((l,) => l.startsWith("event:",)) ?? "";
        const dataLines = frame.split("\n",).filter((l,) => l.startsWith("data:",)).map((l,) =>
          l.slice(5,).trimStart()
        );

        const event = eventLine.slice(6,).trim();
        const data = dataLines.join("\n",);
        if (event === "stream-error") {
          return { ok: false, error: data || "stream error", };
        }

        if (event === "stream-update") { text += data; }
        if (event === "stream-done") { return { ok: true, data: { text, }, }; }
      }
    }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  } finally {
    reader.releaseLock();
  }

  return { ok: true, data: { text, }, };
}

/**
 * Upload a file via multipart POST /api/v1/assets.
 * @param filePath - local file to upload
 * @param sessionToken - bearer token; omit for solo anonymous
 * @param altText - optional alt text
 */
export async function headlessAssetUpload(
  filePath: string,
  sessionToken: string | undefined,
  altText?: string,
): Promise<HeadlessResult<{ id: string; duplicate?: boolean }>> {
  let file: Bun.BunFile;
  try {
    file = Bun.file(filePath,);
    if (!(await file.exists())) { return { ok: false, error: `file not found: ${filePath}`, }; }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  const form = new FormData();
  form.append("file", file, file.name ?? filePath.split("/",).pop() ?? "upload",);
  if (altText) { form.append("alt_text", altText,); }
  await ensureCsrf(sessionToken,);
  let response: Response;
  try {
    response = await _fetch(`${HEADLESS_API_BASE}/api/v1/assets`, {
      method: "POST",
      headers: {
        ...authHeaders(sessionToken,),
        ...(_csrfToken ? { Cookie: `csrf_token=${_csrfToken}`, "X-CSRF-Token": _csrfToken, } : {}),
      },
      body: form,
      signal: AbortSignal.timeout(300_000,),
    },);

    absorbCsrf(response,);
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  return parseJson(response,);
}

/**
 * Link an asset via POST /api/v1/assets/:id/links.
 * @param assetId - asset to link
 * @param chatId - chat entity to link to
 * @param sessionToken - bearer token; omit for solo anonymous
 */
export function headlessAssetLink(
  assetId: string,
  chatId: string,
  sessionToken: string | undefined,
): Promise<HeadlessResult<{ id: string }>> {
  return postJson(`/api/v1/assets/${encodeURIComponent(assetId,)}/links`, {
    entityType: "chat",
    entityId: chatId,
  }, sessionToken,);
}

/** Body for POST /api/v1/actors (CLI-relevant subset of ActorCreateBody). */
export interface HeadlessCharacterBody {
  displayName: string;
  description?: string;
  personality?: string;
  appearance?: string;
  scenario?: string;
  systemPrompt?: string;
  assetId?: string;
}

/**
 * Create a character via POST /api/v1/actors; `avatarAssetId` maps to the route's `assetId`.
 * @param body - actor fields
 * @param sessionToken - bearer token; omit for solo anonymous
 */
export function headlessCharacterCreate(
  body: HeadlessCharacterBody,
  sessionToken: string | undefined,
): Promise<HeadlessResult<{ id: string }>> {
  const { displayName, description, personality, appearance, scenario, systemPrompt, assetId, } = body;
  return postJson("/api/v1/actors", {
    displayName,
    ...(description ? { description, } : {}),
    ...(personality ? { personality, } : {}),
    ...(appearance ? { appearance, } : {}),
    ...(scenario ? { scenario, } : {}),
    ...(systemPrompt ? { systemPrompt, } : {}),
    ...(assetId ? { assetId, } : {}),
  }, sessionToken,);
}

/**
 * Import a character card via multipart POST /api/v1/actors/import.
 * @param filePath - .png / .json / .charx card file
 * @param sessionToken - bearer token; omit for solo anonymous
 */
export async function headlessCharacterImport(
  filePath: string,
  sessionToken: string | undefined,
): Promise<HeadlessResult<{ id: string } & Record<string, unknown>>> {
  let file: Bun.BunFile;
  try {
    file = Bun.file(filePath,);
    if (!(await file.exists())) { return { ok: false, error: `file not found: ${filePath}`, }; }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  const form = new FormData();
  form.append("file", file, file.name ?? filePath.split("/",).pop() ?? "card",);
  await ensureCsrf(sessionToken,);
  let response: Response;
  try {
    response = await _fetch(`${HEADLESS_API_BASE}/api/v1/actors/import`, {
      method: "POST",
      headers: {
        ...authHeaders(sessionToken,),
        ...(_csrfToken ? { Cookie: `csrf_token=${_csrfToken}`, "X-CSRF-Token": _csrfToken, } : {}),
      },
      body: form,
      signal: AbortSignal.timeout(300_000,),
    },);

    absorbCsrf(response,);
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  return parseJson(response,);
}

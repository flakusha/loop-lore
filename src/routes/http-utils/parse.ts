import { jsonError, } from "./responses";
import { HttpStatus, } from "./status";

// ── Shared route utilities ─────────────────────────────────────

/**
 * Parse request body: JSON or form-encoded.
 * Returns typed body on success, error Response on parse failure.
 */
export async function parseBody<T = Record<string, unknown>,>(request: Request,): Promise<T | Response> {
  const ct = request.headers.get("content-type",) ?? "";
  try {
    if (ct.includes("application/json",)) {
      return (await request.json()) as T;
    }
    // form-encoded (htmx default)
    const text = await request.text();
    const params = new URLSearchParams(text,);
    const obj: Record<string, unknown> = Object.fromEntries(params,);
    return obj as T;
  } catch {
    return jsonError({ message: "Invalid request body", status: HttpStatus.BadRequest, },);
  }
}

/**
 * Extract pagination params from URLSearchParams.
 * Defaults: page=1, pageSize=50 (capped at 200).
 * Clamps to safe ranges: page >= 1, pageSize 1..200.
 */
export function parsePagination(searchParams: URLSearchParams,): { page: number; pageSize: number } {
  const rawPage = Number(searchParams.get("page",) ?? "1",);
  const rawSize = Number(searchParams.get("pageSize",) ?? "50",);
  const page = Number.isFinite(rawPage,) && rawPage >= 1 ? Math.floor(rawPage,) : 1;
  const pageSize = Number.isFinite(rawSize,) ? Math.min(Math.max(1, Math.floor(rawSize,),), 200,) : 50;
  return { page, pageSize, };
}

// ── Body field helpers ───────────────────────────────────────

/** Cast body field as string | undefined */
export function str(body: Record<string, unknown>, key: string,): string | undefined {
  return body[key] as string | undefined;
}

/** Cast body field as number | undefined */
export function num(body: Record<string, unknown>, key: string,): number | undefined {
  return body[key] as number | undefined;
}

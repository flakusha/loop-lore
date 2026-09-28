// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plumbing shared by the two halves of the workflow library tab: the module
 * logger, the endpoint path, and the two readers that turn an untrusted
 * response or an operator-typed field into something renderable.
 */
import { safeJsonParse, } from "../json";
import { log as rootLog, } from "../logger";

/** Child logger for this tab. */
export const log = rootLog.child({ module: "admin-workflows", },);

/** The admin ComfyUI workflow library surface. */
export const WORKFLOWS_PATH = "/api/v1/admin/comfyui-workflows";

function isRecord(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

/**
 * The messages a failed response carried, one entry each.
 *
 * `workflowInvalid` joins the ingest error list with "; " into the `error`
 * field. Those messages are the reason this screen exists — an operator fixing
 * a pasted graph needs every one of them at once — so they are split back out
 * instead of being folded into a generic "save failed".
 * @param res - Failed response
 * @param fallback - Message used when the body carries no `error` string
 * @returns One entry per message the server reported
 */
export async function workflowErrors(res: Response, fallback: string,): Promise<string[]> {
  const body: unknown = await res.json().catch(() => null);
  if (isRecord(body,) && typeof body.error === "string") {
    const parts = body.error.split("; ",).map((part,) => part.trim()).filter((part,) => part.length > 0);
    if (parts.length > 0) { return parts; }
  }
  return [fallback,];
}

/**
 * Parse one operator-typed JSON field. Blank means "unset", which the update
 * path reads as "keep what is stored" rather than "clear it".
 *
 * A parse failure appends to `errors` and returns undefined; the caller bails
 * out when `errors` is non-empty, so a bad field is never sent.
 * @param text - Raw textarea contents
 * @param label - Field name used in the error message
 * @param errors - Collected client-side errors
 * @returns The parsed value, or undefined for blank and unparseable input
 */
export function readJsonField(text: string, label: string, errors: string[],): unknown {
  if (!text.trim()) { return undefined; }
  const parsed = safeJsonParse(text,);
  if (!parsed.ok) {
    errors.push(`${label}: not valid JSON — ${parsed.error.message}`,);
    return undefined;
  }
  return parsed.value;
}

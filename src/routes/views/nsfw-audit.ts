import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { type ModAction, NsfwModerationService, type NsfwUserPrefs, } from "../../nsfw/moderation-service";
import { escapeHtml, loadView, respond, } from "./layout";

/** Render a single consent-state row (label/value) for the admin view. */
function consentRow(label: string, value: string,): string {
  return `<tr>
      <td style="font-size: 13px; font-weight: 500; white-space: nowrap; width: 200px">${escapeHtml(label,)}</td>
      <td style="font-size: 13px">${escapeHtml(value,)}</td>
    </tr>`;
}

/**
 * Render the consent-state panel for the target user. Falls back to an
 * explanatory row when no stored preferences exist yet (the service lazily
 * creates default prefs on first read, so a row is normally always present).
 */
function renderNsfwConsent(prefs: NsfwUserPrefs,): string {
  const status = prefs.nsfwEnabled ? "Enabled" : "Disabled";
  const rows = [
    consentRow("NSFW enabled", status,),
    consentRow("Max rating", prefs.maxRating,),
    consentRow("Blocked from NSFW", prefs.blockedFromNsfw ? "Yes" : "No",),
    consentRow("Shadow NSFW", prefs.shadowNsfw ? "Yes" : "No",),
    consentRow("Banned from NSFW", prefs.bannedFromNsfw ? "Yes" : "No",),
  ];
  if (prefs.blockReason) { rows.push(consentRow("Block reason", prefs.blockReason,),); }
  if (prefs.bannedBy) { rows.push(consentRow("Banned by", prefs.bannedBy,),); }
  if (prefs.bannedAt) { rows.push(consentRow("Banned at", prefs.bannedAt,),); }
  rows.push(consentRow("Consent updated", prefs.updatedAt,),);
  return rows.join("\n            ",);
}

/** Render the moderation audit log rows (newest first). */
function renderNsfwAuditRows(actions: ModAction[],): string {
  if (actions.length === 0) {
    return `<tr>
        <td colspan="4" class="empty-state" style="padding: var(--space-8)">No moderation actions recorded</td>
      </tr>`;
  }
  return actions.map((a,) =>
    `<tr>
      <td style="font-size: 12px; white-space: nowrap">${escapeHtml(a.createdAt,)}</td>
      <td style="font-size: 12px">${escapeHtml(a.actionType,)}</td>
      <td style="font-size: 12px">${escapeHtml(a.performedBy,)}</td>
      <td style="font-size: 12px">${escapeHtml(a.reason,)}</td>
    </tr>`
  ).join("\n            ",);
}

/**
 * Server-render the NSFW moderation audit view: consent state + immutable
 * moderation-action audit log for a target user, wrapped in the page layout.
 * Admins may target any user via ?userId=; otherwise the acting admin is shown.
 */
async function serveNsfwModerationAudit(
  database: Kysely<DB>,
  targetUserId: string,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Promise<Response | null> {
  let content = loadView("nsfw-moderation",);
  if (!content) { return null; }

  const svc = new NsfwModerationService(database,);
  const [prefs, actions,] = await Promise.all([
    svc.getPreferences(targetUserId,),
    svc.getAuditLog(targetUserId, { limit: 200, },),
  ],);

  content = content.replace("{{targetUserId}}", () => escapeHtml(targetUserId,),);
  content = content.replace("{{consentHtml}}", () => renderNsfwConsent(prefs,),);
  content = content.replace("{{auditRows}}", () => renderNsfwAuditRows(actions,),);

  return respond(content, isHtmx, "NSFW Moderation Audit", userId, sessionId, request, t,);
}

export { serveNsfwModerationAudit, };
